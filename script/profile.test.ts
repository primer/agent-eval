import {mkdtemp, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawn} from 'node:child_process'
import {expect, test} from 'vitest'
import {parseOptions, runProfile} from './profile'

async function fixture(source: string) {
  const directory = await mkdtemp(join(tmpdir(), 'agent-eval-profile-test-'))
  const entrypoint = join(directory, 'target.js')
  await writeFile(entrypoint, `setTimeout(() => process.exit(124), 5000).unref();\n${source}`)
  return {
    directory,
    entrypoint,
    options: parseOptions(['--output', directory, '--interval-ms', '10', '--', 'argument with spaces', '--help']),
    async [Symbol.asyncDispose]() {
      await rm(directory, {recursive: true, force: true})
    },
  }
}

test('parseOptions forwards CLI arguments verbatim and defaults to no Docker', () => {
  expect(parseOptions(['--', 'run', '--docker', '--interval-ms', 'secret-free-value'])).toMatchObject({
    docker: false,
    profiles: true,
    intervalMs: 500,
    argv: ['run', '--docker', '--interval-ms', 'secret-free-value'],
  })
})

test('runProfile disables native profiles for resource baselines while still sampling the target', async () => {
  await using context = await fixture('process.exitCode = 0')
  const options = parseOptions(['--no-profiles', '--output', context.directory, '--', '--help'])
  const result = await runProfile(options, {entrypoint: context.entrypoint})

  expect(result.exitCode).toBe(0)
  expect(result.report.instrumentation).toEqual({cpuProfile: false, heapProfile: false, processSampling: true})
  expect(result.report.metrics?.maxSampledRssBytes).toBeGreaterThan(0)
  expect(await readdir(result.directory)).toEqual(['memory.jsonl', 'process.json', 'report.json'])
}, 15_000)

test.each([
  {name: 'missing separator', argv: []},
  {name: 'missing CLI arguments', argv: ['--']},
  {name: 'unknown option', argv: ['--unknown', '--', 'run']},
  {name: 'missing option value', argv: ['--output', '--', 'run']},
  {name: 'out-of-range interval', argv: ['--interval-ms', '0', '--', 'run']},
  {name: 'non-numeric interval', argv: ['--interval-ms', 'NaN', '--', 'run']},
])('parseOptions rejects $name', ({argv}) => {
  expect(() => parseOptions(argv)).toThrow()
})

test('runProfile captures target metrics, arguments and native profiles on a failing exit without Docker', async () => {
  await using context = await fixture(`
    import {writeFileSync} from 'node:fs';
    writeFileSync(new URL('./argv.json', import.meta.url), JSON.stringify(process.argv.slice(2)));
    const end = performance.now() + 25;
    while (performance.now() < end) Math.sqrt(Math.random());
    process.exitCode = 7;
  `)
  const result = await runProfile(context.options, {
    entrypoint: context.entrypoint,
    docker: async () => {
      throw new Error('Docker must not be contacted')
    },
  })

  expect(result.exitCode).toBe(7)
  expect(result.report.exit).toEqual({code: 7, signal: null})
  expect(result.report.errors).toEqual([])
  expect(result.report.metrics?.cpuUserMs).toBeGreaterThan(0)
  expect(result.report.metrics?.elapsedMs).toBeGreaterThan(0)
  expect(result.report.harnessElapsedMs).toBeGreaterThan(result.report.metrics!.elapsedMs)
  expect(result.report.metrics?.maxSampledRssBytes).toBeGreaterThan(0)
  expect(JSON.parse(await readFile(join(context.directory, 'argv.json'), 'utf8'))).toEqual(context.options.argv)
  const files = await readdir(result.directory)
  expect(files.some(file => file.endsWith('.cpuprofile'))).toBe(true)
  expect(files.some(file => file.endsWith('.heapprofile'))).toBe(true)
  for (const file of files.filter(name => name.endsWith('.cpuprofile') || name.endsWith('.heapprofile'))) {
    expect((await stat(join(result.directory, file))).size).toBeGreaterThan(0)
  }
  const samples = (await readFile(join(result.directory, 'memory.jsonl'), 'utf8')).trim().split('\n')
  expect(JSON.parse(samples[0]!).rss).toBeGreaterThan(0)
  expect(JSON.parse(await readFile(join(result.directory, 'report.json'), 'utf8')).exit.code).toBe(7)
}, 15_000)

test('runProfile records unavailable Docker as an actionable failure and never starts the target', async () => {
  await using context = await fixture('throw new Error("must not start")')
  const result = await runProfile(
    {...context.options, docker: true},
    {entrypoint: context.entrypoint, docker: async () => Promise.reject(new Error('not installed'))},
  )

  expect(result.exitCode).toBe(1)
  expect(result.report.exit.code).toBe(null)
  expect(result.report.metrics).toBe(null)
  expect(result.report.errors[0]).toContain('Check docker info')
  expect(await readdir(result.directory)).toEqual(['report.json'])
})

test('runProfile does not install metric sampling in Node forks that inherit the preload', async () => {
  await using context = await fixture(`
    import {fork} from 'node:child_process';
    import {writeFileSync} from 'node:fs';
    writeFileSync(new URL('./pid.json', import.meta.url), JSON.stringify(process.pid));
    const child = fork(new URL('./child.js', import.meta.url), [], {silent: true});
    child.stderr.on('data', () => {process.exitCode = 1});
    child.on('exit', code => {if (code) process.exitCode = code});
  `)
  await writeFile(join(context.directory, 'child.js'), 'process.exitCode = 0')
  const result = await runProfile(context.options, {entrypoint: context.entrypoint})

  expect(result.exitCode).toBe(0)
  const metrics = JSON.parse(await readFile(join(result.directory, 'process.json'), 'utf8'))
  expect(metrics.pid).toBe(JSON.parse(await readFile(join(context.directory, 'pid.json'), 'utf8')))
}, 15_000)

test('runProfile samples daemon-wide Docker serially with read-only disk snapshots', async () => {
  await using context = await fixture('setTimeout(() => {}, 100)')
  const commands: Array<Array<string>> = []
  let active = 0
  let maxActive = 0
  const result = await runProfile(
    {...context.options, docker: true},
    {
      entrypoint: context.entrypoint,
      docker: async argv => {
        commands.push(argv)
        active++
        maxActive = Math.max(maxActive, active)
        await new Promise(resolve => setTimeout(resolve, 20))
        active--
        if (argv[0] === 'stats') return '{"CPUPerc":"2.00%","MemUsage":"3MiB / 1GiB","BlockIO":"4kB / 5kB"}\n'
        return '{"Type":"Images","Size":"1GB"}\n'
      },
    },
  )

  expect(result.exitCode).toBe(0)
  expect(maxActive).toBe(1)
  expect(active).toBe(0)
  expect(result.report.docker?.scope).toContain('daemon-wide')
  expect(commands[0]).toEqual(['system', 'df', '--format', '{{json .}}'])
  expect(commands.at(-1)).toEqual(commands[0])
  expect(commands.slice(1, -1).every(argv => argv.join(' ') === 'stats --no-stream --format {{json .}}')).toBe(true)
  const samples = (await readFile(join(result.directory, 'docker-stats.jsonl'), 'utf8')).trim().split('\n')
  expect(JSON.parse(samples[0]!).containers).toEqual([
    {CPUPerc: '2.00%', MemUsage: '3MiB / 1GiB', BlockIO: '4kB / 5kB'},
  ])
  expect(await readFile(join(result.directory, 'docker-disk-after.jsonl'), 'utf8')).toContain('"Size":"1GB"')
}, 15_000)

test('runProfile writes a report for a missing entrypoint and makes unique run directories', async () => {
  await using context = await fixture('')
  const first = await runProfile(context.options, {entrypoint: join(context.directory, 'missing.js')})
  const second = await runProfile(context.options, {entrypoint: join(context.directory, 'missing.js')})

  expect(first.exitCode).toBe(1)
  expect(first.directory).not.toBe(second.directory)
  expect(first.report.errors[0]).toContain('ENOENT')
  expect(JSON.parse(await readFile(join(first.directory, 'report.json'), 'utf8')).metrics).toBe(null)
})

test('runProfile records a target signal and flushes target metrics', async () => {
  await using context = await fixture('setInterval(() => {}, 1000); process.kill(process.pid, "SIGTERM")')
  const result = await runProfile(context.options, {entrypoint: context.entrypoint})

  expect(result.exitCode).toBe(143)
  expect(result.report.exit.signal).toBe('SIGTERM')
  expect(result.report.metrics?.maxSampledRssBytes).toBeGreaterThan(0)
}, 15_000)

test('profile command launches the built CLI and prints a summary with units', async () => {
  await using context = await fixture('')
  const child = spawn(process.execPath, ['script/profile.ts', '--output', context.directory, '--', '--help'], {
    stdio: 'pipe',
    timeout: 10_000,
    killSignal: 'SIGKILL',
  })
  let stdout = ''
  child.stdout.on('data', chunk => {
    stdout += String(chunk)
  })
  const exit = await new Promise<number | null>((resolveExit, reject) => {
    child.on('error', reject)
    child.on('exit', resolveExit)
  })

  expect(exit).toBe(0)
  expect(stdout).toContain('Profile:')
  expect(stdout).toContain('Target CPU:')
  expect(stdout).toContain('target wall:')
  expect(stdout).toContain('harness wall:')
}, 15_000)

test('profile command can measure local plan creation without running paid agents or requiring Docker', async () => {
  await using context = await fixture('')
  const outputPath = join(context.directory, 'plan.json')
  const result = await runProfile({
    ...context.options,
    profiles: false,
    argv: ['experiment', 'plan', 'create', 'noop', '--output-path', outputPath],
  })

  expect(result.exitCode).toBe(0)
  expect(JSON.parse(await readFile(outputPath, 'utf8'))).toMatchObject({id: 'noop', name: 'noop'})
  expect(result.report.metrics?.cpuUserMs).toBeGreaterThan(0)
}, 15_000)

test('runProfile reports Docker sampling and final snapshot failures without changing target exit status', async () => {
  await using context = await fixture('process.exitCode = 9')
  let snapshots = 0
  const result = await runProfile(
    {...context.options, docker: true},
    {
      entrypoint: context.entrypoint,
      docker: async argv => {
        if (argv[0] === 'stats') throw new Error('stats failed')
        if (++snapshots > 1) throw new Error('disk failed')
        return ''
      },
    },
  )

  expect(result.exitCode).toBe(9)
  expect(result.report.errors.some(error => error.includes('stats failed'))).toBe(true)
  expect(result.report.errors.some(error => error.includes('disk failed'))).toBe(true)
  expect(result.report.metrics?.maxSampledRssBytes).toBeGreaterThan(0)
}, 15_000)

test.each([
  {signal: 'SIGINT', code: 130},
  {signal: 'SIGTERM', code: 143},
] as const)(
  'runProfile preserves native profiles after forwarded $signal and CLI-owned cleanup',
  async ({signal, code}) => {
    await using context = await fixture(`
    process.once(${JSON.stringify(signal)}, () => {
      Promise.resolve().finally(() => process.exit(${code}));
    });
    console.log("target-ready");
    setInterval(() => {}, 1000);
  `)
    const wrapper = join(context.directory, 'wrapper.js')
    await writeFile(
      wrapper,
      `import {runProfile} from ${JSON.stringify(new URL('./profile.ts', import.meta.url).href)};
     const result = await runProfile(${JSON.stringify(context.options)}, {entrypoint: ${JSON.stringify(context.entrypoint)}});
     process.exitCode = result.exitCode;`,
    )
    const child = spawn(process.execPath, [wrapper], {stdio: 'pipe', timeout: 10_000, killSignal: 'SIGKILL'})
    const exited = new Promise<number | null>((resolveExit, reject) => {
      child.on('error', reject)
      child.on('exit', resolveExit)
    })
    try {
      await new Promise<void>((ready, reject) => {
        let output = ''
        const timeout = setTimeout(() => reject(new Error('Target did not become ready')), 5000)
        child.stdout.on('data', chunk => {
          output += String(chunk)
          if (output.includes('target-ready')) {
            clearTimeout(timeout)
            ready()
          }
        })
      })
      child.kill(signal)
      expect(await exited).toBe(code)
      const run = (await readdir(context.directory)).find(name => name.startsWith('run-'))!
      const report = JSON.parse(await readFile(join(context.directory, run, 'report.json'), 'utf8'))
      expect(report.interruptedBy).toBe(signal)
      expect(report.exit).toEqual({code, signal: null})
      expect(report.metrics.maxSampledRssBytes).toBeGreaterThan(0)
      const files = await readdir(join(context.directory, run))
      expect(files.some(file => file.endsWith('.cpuprofile'))).toBe(true)
      expect(files.some(file => file.endsWith('.heapprofile'))).toBe(true)
      for (const file of files.filter(name => name.endsWith('.cpuprofile') || name.endsWith('.heapprofile'))) {
        expect((await stat(join(context.directory, run, file))).size).toBeGreaterThan(0)
      }
    } finally {
      child.kill('SIGKILL')
      await exited
    }
  },
  15_000,
)
