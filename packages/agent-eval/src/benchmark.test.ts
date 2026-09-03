import {expect, test} from 'vitest'
import {
  defineConfig,
  deserialize,
  getBenchmark,
  listBenchmarks,
  output,
  run,
  serialize,
  type BenchmarkTrialResult,
} from './benchmark'
import {VirtualHost} from './host'
import {defineConfig as defineScenarioConfig} from './scenario'

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

test('output serializes and deserializes benchmark capability metadata', () => {
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
      directory: '/artifacts/trial',
      copilotConfigDirectory: '/artifacts/trial/.copilot',
      skillsConfigDirectory: '/artifacts/trial/.agents',
      testResultsPath: '/artifacts/trial/workspace/test-results.json',
      workspaceDirectory: '/artifacts/trial/workspace',
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
      type: 'Unavailable',
    },
  }

  const benchmarkOutput = output('test-benchmark', [trialResult])

  expect(benchmarkOutput.benchmarkId).toBe('test-benchmark')
  expect(benchmarkOutput.capabilities.get('Test capability')).toEqual({
    name: 'Test capability',
    scenarioIds: ['001-scenario'],
  })
  expect(benchmarkOutput.trials.get('trial')).toEqual(
    expect.objectContaining({
      capabilityId: 'Test capability',
      scenarioId: '001-scenario',
      treatmentId: 'Benchmark',
    }),
  )
  expect(deserialize(serialize(benchmarkOutput))).toEqual(benchmarkOutput)
})
