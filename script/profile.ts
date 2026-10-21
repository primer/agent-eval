import {execFile, spawn, type ChildProcess} from 'node:child_process'
import {mkdir, mkdtemp, readFile, writeFile, appendFile, access} from 'node:fs/promises'
import {constants} from 'node:os'
import {join, resolve} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {promisify} from 'node:util'

const root = fileURLToPath(new URL('../', import.meta.url))
const usage =
  'node script/profile.ts [--no-profiles] [--docker] [--interval-ms 500] [--output artifacts/profiles] -- <CLI args>'

export function parseOptions(argv: Array<string>) {
  let docker = false
  let profiles = true
  let intervalMs = 500
  let output = join(root, 'artifacts/profiles')
  const separator = argv.indexOf('--')
  if (separator === -1 || separator === argv.length - 1) throw new Error(usage)
  for (let index = 0; index < separator; index++) {
    const option = argv[index]
    if (option === '--docker') {
      docker = true
    } else if (option === '--no-profiles') {
      profiles = false
    } else if (option === '--interval-ms' || option === '--output') {
      const value = argv[++index]
      if (index >= separator || !value) throw new Error(`Missing value for ${option}. ${usage}`)
      if (option === '--output') output = resolve(value)
      else {
        intervalMs = Number(value)
        if (!Number.isSafeInteger(intervalMs) || intervalMs < 10 || intervalMs > 60_000) {
          throw new Error('--interval-ms must be an integer between 10 and 60000')
        }
      }
    } else {
      throw new Error(`Unknown profiler option ${option}. ${usage}`)
    }
  }
  return {docker, profiles, intervalMs, output, argv: argv.slice(separator + 1)}
}

const execFileAsync = promisify(execFile)
async function dockerCommand(argv: Array<string>) {
  const {stdout} = await execFileAsync('docker', argv, {
    timeout: 5000,
    killSignal: 'SIGKILL',
    maxBuffer: 4 * 1024 * 1024,
    encoding: 'utf8',
  })
  return stdout
}

export async function runProfile(
  options: ReturnType<typeof parseOptions>,
  {
    entrypoint = join(root, 'packages/agent-eval/bin/agent-eval'),
    docker = dockerCommand,
  }: {entrypoint?: string; docker?: typeof dockerCommand} = {},
) {
  await mkdir(options.output, {recursive: true})
  const directory = await mkdtemp(join(options.output, 'run-'))
  const started = performance.now()
  const report = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    harnessElapsedMs: 0,
    cwd: process.cwd(),
    argv: options.argv,
    entrypoint,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    intervalMs: options.intervalMs,
    instrumentation: {cpuProfile: options.profiles, heapProfile: options.profiles, processSampling: true},
    scope: 'Target Node process (all its threads); excludes subprocesses and containers',
    units: {memory: 'bytes', cpu: 'milliseconds', resourceUsage: 'Node resourceUsage: CPU microseconds, maxRSS KiB'},
    docker: options.docker ? {scope: 'daemon-wide; all running containers, not attributed to this run'} : null,
    exit: {code: null as number | null, signal: null as NodeJS.Signals | null},
    interruptedBy: null as NodeJS.Signals | null,
    errors: [] as Array<string>,
    metrics: null as null | {
      elapsedMs: number
      cpuUserMs: number
      cpuSystemMs: number
      maxSampledRssBytes: number
      measurementError: string | null
    },
  }
  let stopped = false
  let child: ChildProcess | undefined
  let interruptedSignal: NodeJS.Signals | null = null
  let escalation: NodeJS.Timeout | undefined
  const forward = (signal: NodeJS.Signals) => {
    interruptedSignal = signal
    child?.kill(signal)
    if (child && !escalation) escalation = setTimeout(() => child?.kill('SIGKILL'), 5000)
  }
  const interrupt = () => forward('SIGINT')
  const terminate = () => forward('SIGTERM')
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', terminate)
  let timer: NodeJS.Timeout | undefined
  let sampling = Promise.resolve()
  const snapshot = async (phase: string) => {
    const stdout = await docker(['system', 'df', '--format', '{{json .}}'])
    await writeFile(join(directory, `docker-disk-${phase}.jsonl`), stdout)
  }
  const sampleDocker = async () => {
    try {
      const stdout = await docker(['stats', '--no-stream', '--format', '{{json .}}'])
      const containers: Array<unknown> = stdout.trim()
        ? stdout
            .trim()
            .split('\n')
            .map(line => JSON.parse(line))
        : []
      await appendFile(
        join(directory, 'docker-stats.jsonl'),
        `${JSON.stringify({elapsedMs: performance.now() - started, containers})}\n`,
      )
    } catch (error) {
      report.errors.push(`Docker sample failed: ${String(error)}`)
    }
    if (!stopped) {
      timer = setTimeout(() => {
        sampling = sampleDocker()
      }, options.intervalMs)
    }
  }
  try {
    await access(entrypoint)
    if (options.docker) {
      try {
        await snapshot('before')
      } catch (error) {
        throw new Error('Docker profiling requires an available Docker CLI and reachable daemon. Check docker info.', {
          cause: error,
        })
      }
      sampling = sampleDocker()
    }
    if (interruptedSignal) throw new Error(`Profiling interrupted by ${interruptedSignal}`)
    child = spawn(
      process.execPath,
      [
        ...(options.profiles
          ? ['--cpu-prof', `--cpu-prof-dir=${directory}`, '--heap-prof', `--heap-prof-dir=${directory}`]
          : []),
        '--import',
        fileURLToPath(new URL('./profile-process.ts', import.meta.url)),
        entrypoint,
        ...options.argv,
      ],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          AGENT_EVAL_PROFILE_DIRECTORY: directory,
          AGENT_EVAL_PROFILE_INTERVAL: String(options.intervalMs),
        },
      },
    )
    try {
      const target = child
      report.exit = await new Promise((resolveExit, reject) => {
        target.once('error', reject)
        target.once('exit', (code, signal) => resolveExit({code, signal}))
      })
    } finally {
      clearTimeout(escalation)
      child = undefined
    }
    try {
      report.metrics = JSON.parse(await readFile(join(directory, 'process.json'), 'utf8'))
      if (report.metrics?.measurementError) report.errors.push(report.metrics.measurementError)
    } catch (error) {
      report.errors.push(`Target metrics unavailable (startup failure or forced termination): ${String(error)}`)
    }
  } catch (error) {
    report.errors.push(String(error))
  } finally {
    stopped = true
    clearTimeout(timer)
    await sampling
    if (options.docker) {
      try {
        await snapshot('after')
      } catch (error) {
        report.errors.push(`Docker final disk snapshot failed: ${String(error)}`)
      }
    }
    report.finishedAt = new Date().toISOString()
    report.harnessElapsedMs = performance.now() - started
    report.interruptedBy = interruptedSignal
    process.removeListener('SIGINT', interrupt)
    process.removeListener('SIGTERM', terminate)
    await writeFile(join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  }
  const signal = interruptedSignal ?? report.exit.signal
  const signalCode = signal ? 128 + constants.signals[signal] : null
  const exitCode = signalCode ?? (report.exit.code || (report.errors.length ? 1 : 0))
  return {directory, report, exitCode}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const {directory, report, exitCode} = await runProfile(parseOptions(process.argv.slice(2)))
    console.log(`Profile: ${directory}`)
    if (report.metrics) {
      console.log(
        `Target CPU: ${(report.metrics.cpuUserMs + report.metrics.cpuSystemMs).toFixed(1)} ms; sampled max RSS: ${(report.metrics.maxSampledRssBytes / 1024 / 1024).toFixed(1)} MiB; target wall: ${report.metrics.elapsedMs.toFixed(1)} ms; harness wall: ${report.harnessElapsedMs.toFixed(1)} ms`,
      )
    }
    for (const error of report.errors) console.error(error)
    process.exitCode = exitCode
  } catch (error) {
    console.error(String(error))
    process.exitCode = 1
  }
}
