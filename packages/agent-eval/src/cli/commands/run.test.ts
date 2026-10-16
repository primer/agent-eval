import {runCommand} from 'citty'
import tarFs from 'tar-fs'
import {afterEach, beforeEach, expect, test, vi} from 'vitest'
import {DefaultHost, VirtualHost} from '../../host'
import * as plan from '../../plan'
import {DEFAULT_DOCKER_IMAGE} from '../../sandbox/constants'
import {defaultScenarioSetup} from '../../scenario/scenario'
import {benchmark} from './benchmark'
import {experiment} from './experiment'

vi.mock('../../host', async importOriginal => {
  const original = await importOriginal<typeof import('../../host')>()
  return {...original, DefaultHost: original.VirtualHost.create()}
})

vi.mock('../../docker', async importOriginal => {
  const original = await importOriginal<typeof import('../../docker')>()
  return {
    ...original,
    buildImage: vi.fn<typeof original.buildImage>(async (_context, options) => {
      return {tagName: options.t}
    }),
  }
})

vi.mock('../../trial/run', async importOriginal => {
  const original = await importOriginal<typeof import('../../trial/run')>()
  return {
    ...original,
    runTrial: vi.fn<typeof original.runTrial>(async ({trial, artifactsDirectory, host = DefaultHost}) => {
      const directory = `${artifactsDirectory}/${trial.id}`
      await host.fs.promises.mkdir(directory, {recursive: true})
      return {
        trial,
        agent: {sessions: []},
        artifacts: {
          directory,
          copilotConfigDirectory: artifactsDirectory,
          skillsConfigDirectory: artifactsDirectory,
          walkthroughDirectory: artifactsDirectory,
          workspaceDirectory: artifactsDirectory,
        },
        checks: [],
        judges: [],
        walkthrough: {type: 'Unavailable'},
      }
    }),
  }
})

beforeEach(() => {
  const host = VirtualHost.create({
    '/benchmarks/example.ts': `export default ${JSON.stringify({
      name: 'Example benchmark',
      description: 'Example benchmark',
      models: ['gpt-5.5'],
      capabilities: [{name: 'Example capability', scenarios: ['example']}],
    })}`,
    '/experiments/example.ts': `export default ${JSON.stringify({
      name: 'Example experiment',
      description: 'Example experiment',
      models: ['gpt-5.5'],
      scenarios: ['example'],
      treatments: [{name: 'Example treatment'}],
    })}`,
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {prompt: "Create a page"}',
  })
  DefaultHost.fs = host.fs
  vi.spyOn(DefaultHost, 'loadModule').mockImplementation(host.loadModule.bind(host))
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

test.each([
  {kind: 'benchmark', command: benchmark, savedPlan: false},
  {kind: 'benchmark', command: benchmark, savedPlan: true},
  {kind: 'experiment', command: experiment, savedPlan: false},
  {kind: 'experiment', command: experiment, savedPlan: true},
])('$kind run (saved plan: $savedPlan) applies default and overridden scenario bases', async ({command, savedPlan}) => {
  const createArchive = tarFs.pack
  const dockerfiles: Array<unknown> = []
  vi.spyOn(tarFs, 'pack').mockImplementation((_directory, options) => {
    const context = createArchive('.', {entries: [], finalize: false})
    const entry = vi.spyOn(context, 'entry')
    options?.finish?.(context)
    dockerfiles.push(entry.mock.calls.find(([header]) => header.name === 'Dockerfile')?.[1])
    return context
  })
  const runPlan = vi.spyOn(plan, 'runPlan')
  const directories = ['--benchmarks', '/benchmarks', '--experiments', '/experiments', '--scenarios', '/scenarios']
  if (savedPlan) {
    await runCommand(command, {
      rawArgs: ['plan', 'create', 'example', ...directories, '--output-path', '/plan.json'],
    })
  }
  const args = savedPlan ? ['plan', 'run', '--plan-path', '/plan.json'] : ['run', 'example']

  for (const dockerImage of [undefined, 'node:26-slim']) {
    dockerfiles.length = 0
    await runCommand(command, {
      rawArgs: [
        ...args,
        ...directories,
        '--token',
        'test-token',
        '--output-dir',
        '/results',
        ...(dockerImage ? ['--docker-image', dockerImage] : []),
      ],
    })

    expect(runPlan).toHaveBeenLastCalledWith(
      expect.objectContaining({dockerImage: dockerImage ?? DEFAULT_DOCKER_IMAGE}),
    )
    expect(dockerfiles.length).toBeGreaterThan(0)
    for (const dockerfile of dockerfiles) {
      expect(dockerfile).toContain(`FROM ${dockerImage ?? DEFAULT_DOCKER_IMAGE}\n`)
    }
    const trials = runPlan.mock.lastCall?.[0].plan.trials
    expect(trials?.length).toBeGreaterThan(0)
    for (const trial of trials ?? []) {
      expect(trial.scenario.image).toEqual({type: 'Default'})
      expect(trial.scenario.setup).toBe(defaultScenarioSetup)
    }
  }
})
