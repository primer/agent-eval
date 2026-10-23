import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdtemp, mkdir, copyFile, writeFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {expect, test} from 'vitest'

const execute = promisify(execFile)

async function createFixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'agent-eval-retry-'))
  await mkdir(path.join(directory, 'script'))
  await mkdir(path.join(directory, 'bin'))
  const source = path.join(directory, 'original evaluation')
  await mkdir(source)
  const script = path.join(directory, 'script', 'retry-evaluation.sh')
  await copyFile(new URL('../../../../script/retry-evaluation.sh', import.meta.url), script)
  await writeFile(path.join(directory, 'bin', 'node'), '#!/bin/sh\nprintf "%s\\n" "$PWD" "$@"\n', {mode: 0o755})
  return {
    directory,
    source,
    script,
    env: {
      ...process.env,
      PATH: `${path.join(directory, 'bin')}${path.delimiter}${process.env.PATH}`,
      COPILOT_CONCURRENCY: '3',
      CONTAINER_CONCURRENCY: '4',
    },
  }
}

test.each(['benchmark', 'experiment'] as const)(
  'workflow recovery invokes %s retry with the original result date and source definitions',
  async type => {
    const fixture = await createFixture()
    try {
      const output = path.join(fixture.directory, 'results', `${type}s`, 'example', '2026-10-01')
      await mkdir(output, {recursive: true})
      await writeFile(path.join(output, 'output.json'), '{}')

      const result = await execute('bash', [fixture.script, type, fixture.source], {env: fixture.env})

      expect(result.stdout.trim().split('\n')).toEqual([
        fixture.source,
        path.join(fixture.directory, 'packages', 'agent-eval', 'bin', 'agent-eval'),
        type,
        'retry',
        '--benchmarks',
        path.join(fixture.source, 'benchmarks'),
        '--scenarios',
        path.join(fixture.source, 'scenarios'),
        '--output-dir',
        output,
        '--copilot-concurrency',
        '3',
        '--container-concurrency',
        '4',
        ...(type === 'experiment' ? ['--experiments', path.join(fixture.source, 'experiments')] : []),
      ])
    } finally {
      await rm(fixture.directory, {recursive: true, force: true})
    }
  },
)

test.each([0, 2])('workflow recovery rejects an artifact containing %s merged result bundles', async count => {
  const fixture = await createFixture()
  try {
    for (let index = 0; index < count; index++) {
      const output = path.join(fixture.directory, 'results', 'benchmarks', `example-${index}`, '2026-10-01')
      await mkdir(output, {recursive: true})
      await writeFile(path.join(output, 'output.json'), '{}')
    }

    await expect(
      execute('bash', [fixture.script, 'benchmark', fixture.source], {env: fixture.env}),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(`found ${count}`),
    })
  } finally {
    await rm(fixture.directory, {recursive: true, force: true})
  }
})
