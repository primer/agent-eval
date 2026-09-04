import {afterEach, expect, test, vi} from 'vitest'
import {
  defineConfig,
  deserialize,
  getBenchmark,
  listBenchmarks,
  output,
  read,
  run,
  serialize,
  write,
  type BenchmarkTrialResult,
} from './benchmark'
import {VirtualHost} from './host'
import {run as runPlan} from './plan'
import {defineConfig as defineScenarioConfig} from './scenario'

vi.mock('./plan', async importOriginal => {
  const original = await importOriginal<typeof import('./plan')>()
  return {
    ...original,
    run: vi.fn(original.run),
  }
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

const config = defineConfig({
  name: 'Test benchmark',
  description: 'Tests a benchmark',
  models: ['gpt-5.6-sol'],
  capabilities: [
    {
      name: 'Test capability',
      scenarios: ['001-scenario'],
    },
  ],
})

const scenario = defineScenarioConfig({
  prompt: 'Complete the task',
})

function createHost(files: Record<string, string>) {
  return VirtualHost.create({
    '/benchmarks': files,
    '/scenarios': {
      '001-scenario': {
        'scenario.config.ts': `export default ${JSON.stringify(scenario)}`,
        'scenario.test.ts': '',
        'package.json': JSON.stringify({}),
      },
    },
  })
}

test('listBenchmarks loads configs and resolves models and capability scenarios', async () => {
  const serializedConfig = JSON.stringify(config)
  const host = createHost({
    'named.ts': `export const benchmark = ${serializedConfig}`,
    'default.js': `export default ${serializedConfig}`,
    'types.d.ts': `export const benchmark = ${serializedConfig}`,
    'index.ts': `export const benchmark = ${serializedConfig}`,
    'unsupported.json': serializedConfig,
    'missing.ts': 'export const value = true',
    'invalid.ts': 'export const benchmark = {}',
  })

  const benchmarks = await listBenchmarks({
    host,
    benchmarksDirectory: '/benchmarks',
    scenariosDirectory: '/scenarios',
  })

  expect(benchmarks).toHaveLength(2)
  expect(benchmarks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'named',
        filepath: '/benchmarks/named.ts',
        name: config.name,
        models: [
          {
            name: 'gpt-5.6-sol',
            reasoningEffort: 'medium',
          },
        ],
        capabilities: [
          {
            name: 'Test capability',
            scenarios: [
              expect.objectContaining({
                id: '001-scenario',
                prompt: 'Complete the task',
              }),
            ],
          },
        ],
      }),
      expect.objectContaining({
        id: 'default',
        filepath: '/benchmarks/default.js',
      }),
    ]),
  )
})

test('listBenchmarks prefers the named benchmark export', async () => {
  const namedConfig = {
    ...config,
    name: 'Named benchmark',
  }
  const defaultConfig = {
    ...config,
    name: 'Default benchmark',
  }
  const host = createHost({
    'benchmark.ts': [
      `export const benchmark = ${JSON.stringify(namedConfig)}`,
      `export default ${JSON.stringify(defaultConfig)}`,
    ].join('\n'),
  })

  await expect(
    listBenchmarks({
      host,
      benchmarksDirectory: '/benchmarks',
      scenariosDirectory: '/scenarios',
    }),
  ).resolves.toEqual([
    expect.objectContaining({
      id: 'benchmark',
      name: 'Named benchmark',
    }),
  ])
})

test('listBenchmarks sorts benchmarks by filename', async () => {
  const serializedConfig = JSON.stringify(config)
  const host = createHost({
    'z-last.ts': `export const benchmark = ${serializedConfig}`,
    'a-first.ts': `export const benchmark = ${serializedConfig}`,
  })

  const benchmarks = await listBenchmarks({
    host,
    benchmarksDirectory: '/benchmarks',
    scenariosDirectory: '/scenarios',
  })

  expect(
    benchmarks.map(benchmark => {
      return benchmark.id
    }),
  ).toEqual(['a-first', 'z-last'])
})

test('listBenchmarks validates the benchmarks directory', async () => {
  const host = VirtualHost.create()

  await expect(
    listBenchmarks({
      host,
      benchmarksDirectory: '/benchmarks',
      scenariosDirectory: '/scenarios',
    }),
  ).rejects.toThrow('Benchmarks directory does not exist: /benchmarks')

  const fileHost = VirtualHost.create({
    '/benchmarks': '',
  })

  await expect(
    listBenchmarks({
      host: fileHost,
      benchmarksDirectory: '/benchmarks',
      scenariosDirectory: '/scenarios',
    }),
  ).rejects.toThrow('Benchmarks path is not a directory: /benchmarks')
})

test('getBenchmark returns the benchmark matching the id', async () => {
  const serializedConfig = JSON.stringify(config)
  const host = createHost({
    'first.ts': `export const benchmark = ${serializedConfig}`,
    'second.ts': `export const benchmark = ${serializedConfig}`,
  })

  await expect(
    getBenchmark({
      host,
      benchmarksDirectory: '/benchmarks',
      scenariosDirectory: '/scenarios',
      id: 'second',
    }),
  ).resolves.toEqual(
    expect.objectContaining({
      id: 'second',
      filepath: '/benchmarks/second.ts',
      name: config.name,
    }),
  )
})

test('getBenchmark throws when the benchmark is not found', async () => {
  const host = createHost({})

  await expect(
    getBenchmark({
      host,
      benchmarksDirectory: '/benchmarks',
      scenariosDirectory: '/scenarios',
      id: 'missing',
    }),
  ).rejects.toThrow('Benchmark "missing" was not found in: /benchmarks')
})

test('run returns an empty result when the benchmark has no trials', async () => {
  const emptyConfig = defineConfig({
    name: 'Empty benchmark',
    description: 'Has no trials',
    models: [],
    capabilities: [],
  })
  const host = createHost({
    'empty.ts': `export const benchmark = ${JSON.stringify(emptyConfig)}`,
  })

  await expect(
    run({
      env: {
        artifactsDirectory: '/artifacts',
        benchmarksDirectory: '/benchmarks',
        concurrency: 1,
        copilotToken: 'token',
        dockerImage: 'node:26-slim',
        experimentsDirectory: '/experiments',
        outputPath: '/output.json',
        scenariosDirectory: '/scenarios',
      },
      host,
      id: 'empty',
    }),
  ).resolves.toEqual([])
})

test('run applies global and capability setup to benchmark treatment trials', async () => {
  const setupOrder: Array<string> = []
  const benchmarkConfig = defineConfig({
    name: 'Benchmark with setup',
    description: 'Runs global and capability setup',
    models: ['gpt-5.6-sol'],
    async setup() {
      setupOrder.push('global')
    },
    capabilities: [
      {
        name: 'Capability with setup',
        scenarios: ['001-scenario'],
        async setup() {
          setupOrder.push('capability')
        },
      },
    ],
  })
  const host = createHost({
    'with-setup.ts': '',
  })
  const loadModule = host.loadModule.bind(host)
  vi.spyOn(host, 'loadModule').mockImplementation(async filepath => {
    if (filepath === '/benchmarks/with-setup.ts') {
      return {
        benchmark: benchmarkConfig,
      }
    }

    return loadModule(filepath)
  })
  vi.mocked(runPlan).mockImplementationOnce(async ({plan}) => {
    const controlTrial = plan.trials.find(trial => {
      return trial.treatment.name === 'Control'
    })
    const benchmarkTrial = plan.trials.find(trial => {
      return trial.treatment.name === 'Benchmark'
    })

    expect(controlTrial?.treatment.setup).toBeUndefined()
    expect(benchmarkTrial?.treatment.setup).toBeDefined()

    const sandbox = await host.createSandbox()
    await benchmarkTrial?.treatment.setup?.({sandbox})

    return []
  })

  await expect(
    run({
      env: {
        artifactsDirectory: '/artifacts',
        benchmarksDirectory: '/benchmarks',
        concurrency: 1,
        copilotToken: 'token',
        dockerImage: 'node:26-slim',
        experimentsDirectory: '/experiments',
        outputPath: '/output.json',
        scenariosDirectory: '/scenarios',
      },
      host,
      id: 'with-setup',
    }),
  ).resolves.toEqual([])

  expect(setupOrder).toEqual(['global', 'capability'])
})

test('output serializes and deserializes benchmark capability metadata', async () => {
  const capability = {
    name: 'Test capability',
    scenarios: [
      {
        id: '001-scenario',
        directory: '/scenarios/001-scenario',
        prompt: 'Complete the task',
        tags: [],
        testPath: '/scenarios/001-scenario/scenario.test.ts',
      },
    ],
  }
  const trialResult: BenchmarkTrialResult = {
    capability,
    artifacts: {
      directory: '/bundle/artifacts/trial',
      copilotConfigDirectory: '/bundle/artifacts/trial/.copilot',
      skillsConfigDirectory: '/bundle/artifacts/trial/.agents',
      testResultsPath: '/bundle/artifacts/trial/workspace/test-results.json',
      workspaceDirectory: '/bundle/artifacts/trial/workspace',
    },
    trial: {
      id: 'trial',
      scenario: capability.scenarios[0],
      treatment: {
        name: 'Benchmark',
      },
      model: {
        name: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
      },
    },
    agent: {
      sessions: [],
    },
    testResults: {
      numTotalTests: 1,
      numPassedTests: 1,
      numFailedTests: 0,
      numPendingTests: 0,
      numTodoTests: 0,
      success: true,
      testResults: [],
    },
    walkthrough: {
      type: 'Screenshots',
      screenshots: [
        '/bundle/artifacts/trial/walkthrough/screenshots/01.png',
        '/bundle/artifacts/trial/walkthrough/screenshots/02.png',
      ],
    },
  }

  const benchmarkOutput = output('test-benchmark', [trialResult], {
    baseDirectory: '/bundle',
  })

  expect(benchmarkOutput.benchmarkId).toBe('test-benchmark')
  expect(benchmarkOutput.capabilities.get('Test capability')).toEqual({
    name: 'Test capability',
    scenarioIds: ['001-scenario'],
  })
  expect(benchmarkOutput.trials.get('trial')).toEqual(
    expect.objectContaining({
      capabilityId: 'Test capability',
      artifacts: {
        directory: 'artifacts/trial',
        copilotConfigDirectory: 'artifacts/trial/.copilot',
        skillsConfigDirectory: 'artifacts/trial/.agents',
        testResultsPath: 'artifacts/trial/workspace/test-results.json',
        workspaceDirectory: 'artifacts/trial/workspace',
      },
      scenarioId: '001-scenario',
      treatmentId: 'Benchmark',
      walkthrough: {
        type: 'Screenshots',
        screenshots: [
          'artifacts/trial/walkthrough/screenshots/01.png',
          'artifacts/trial/walkthrough/screenshots/02.png',
        ],
      },
    }),
  )
  expect(deserialize(serialize(benchmarkOutput))).toEqual(benchmarkOutput)

  const host = VirtualHost.create()
  await write('/bundle/output.json', benchmarkOutput, {host})

  expect(JSON.parse(await host.fs.readFile('/bundle/output.json', 'utf-8'))).toEqual({
    benchmarkId: 'test-benchmark',
    capabilities: {
      'Test capability': {
        name: 'Test capability',
        scenarioIds: ['001-scenario'],
      },
    },
    scenarios: {
      '001-scenario': expect.objectContaining({
        id: '001-scenario',
      }),
    },
    treatments: {
      Benchmark: {
        name: 'Benchmark',
      },
    },
    trials: {
      trial: 'artifacts/trial.json',
    },
  })
  expect(JSON.parse(await host.fs.readFile('/bundle/artifacts/trial.json', 'utf-8'))).toEqual(
    benchmarkOutput.trials.get('trial'),
  )
  await expect(read('/bundle/output.json', {host})).resolves.toEqual(benchmarkOutput)
})
