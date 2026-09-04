import path from 'node:path'
import {expect, test} from 'vitest'
import {defineConfig, deserialize, getExperiment, listExperiments, output, serialize} from './experiment'
import {VirtualHost} from './host'
import type {TrialResult} from './trial'

const config = defineConfig({
  name: 'Test experiment',
  description: 'Tests an experiment',
  models: ['gpt-5.6-sol'],
  scenarios: [],
  treatments: [
    {
      name: 'Test treatment',
    },
  ],
})

function resolveConfig(input: typeof config) {
  return {
    ...input,
    models: [
      {
        name: 'gpt-5.6-sol' as const,
        reasoningEffort: 'medium' as const,
      },
    ],
    setup: undefined,
  }
}

test('listExperiments loads named and default exports from supported files', async () => {
  const serializedConfig = JSON.stringify(config)
  const host = VirtualHost.create({
    '/experiments': {
      'named.ts': `export const experiment = ${serializedConfig}`,
      'default.js': `export default ${serializedConfig}`,
      'commonjs.cjs': `export default ${serializedConfig}`,
      'module.mjs': `export default ${serializedConfig}`,
    },
  })

  const experiments = await listExperiments({
    host,
    experimentsDirectory: '/experiments',
    scenariosDirectory: '/scenarios',
  })

  expect(experiments).toHaveLength(4)
  expect(experiments).toEqual(
    expect.arrayContaining([
      {
        ...resolveConfig(config),
        id: 'named',
        filepath: '/experiments/named.ts',
      },
      {
        ...resolveConfig(config),
        id: 'default',
        filepath: '/experiments/default.js',
      },
      {
        ...resolveConfig(config),
        id: 'commonjs',
        filepath: '/experiments/commonjs.cjs',
      },
      {
        ...resolveConfig(config),
        id: 'module',
        filepath: '/experiments/module.mjs',
      },
    ]),
  )
})

test('listExperiments prefers the named experiment export', async () => {
  const namedConfig = {
    ...config,
    name: 'Named experiment',
  }
  const defaultConfig = {
    ...config,
    name: 'Default experiment',
  }
  const host = VirtualHost.create({
    '/experiments': {
      'experiment.ts': [
        `export const experiment = ${JSON.stringify(namedConfig)}`,
        `export default ${JSON.stringify(defaultConfig)}`,
      ].join('\n'),
    },
  })

  await expect(
    listExperiments({
      host,
      experimentsDirectory: '/experiments',
      scenariosDirectory: '/scenarios',
    }),
  ).resolves.toEqual([
    {
      ...resolveConfig(namedConfig),
      id: 'experiment',
      filepath: '/experiments/experiment.ts',
    },
  ])
})

test('listExperiments sorts experiments by filename', async () => {
  const serializedConfig = JSON.stringify(config)
  const host = VirtualHost.create({
    '/experiments': {
      'z-last.ts': `export const experiment = ${serializedConfig}`,
      'a-first.ts': `export const experiment = ${serializedConfig}`,
    },
  })

  const experiments = await listExperiments({
    host,
    experimentsDirectory: '/experiments',
    scenariosDirectory: '/scenarios',
  })

  expect(
    experiments.map(experiment => {
      return experiment.id
    }),
  ).toEqual(['a-first', 'z-last'])
})

test('listExperiments resolves inline scenario paths with optional names', async () => {
  const unnamedDirectory = path.resolve('/fixtures/unnamed-scenario')
  const namedDirectory = path.resolve('/fixtures/named-scenario')
  const inlineConfig = {
    ...config,
    scenarios: [
      {
        path: unnamedDirectory,
      },
      {
        name: 'custom-name',
        path: namedDirectory,
      },
    ],
  }
  const scenarioConfig = JSON.stringify({
    prompt: 'Complete the task',
  })
  const host = VirtualHost.create({
    '/experiments': {
      'inline.ts': `export default ${JSON.stringify(inlineConfig)}`,
    },
    '/fixtures': {
      'unnamed-scenario': {
        'scenario.browser.test.ts': '',
        'scenario.config.ts': `export default ${scenarioConfig}`,
        'scenario.test.ts': '',
      },
      'named-scenario': {
        'scenario.config.ts': `export default ${scenarioConfig}`,
        'scenario.test.ts': '',
      },
    },
  })

  await expect(
    listExperiments({
      host,
      experimentsDirectory: '/experiments',
      scenariosDirectory: '/scenarios',
    }),
  ).resolves.toEqual([
    {
      ...resolveConfig(inlineConfig),
      id: 'inline',
      filepath: '/experiments/inline.ts',
      scenarios: [
        {
          id: 'unnamed-scenario',
          directory: unnamedDirectory,
          prompt: 'Complete the task',
          tags: [],
          testPath: path.join(unnamedDirectory, 'scenario.test.ts'),
          browserTestPath: path.join(unnamedDirectory, 'scenario.browser.test.ts'),
        },
        {
          id: 'custom-name',
          directory: namedDirectory,
          prompt: 'Complete the task',
          tags: [],
          testPath: path.join(namedDirectory, 'scenario.test.ts'),
        },
      ],
    },
  ])
})

test('listExperiments ignores unsupported, reserved, missing, and invalid configs', async () => {
  const serializedConfig = JSON.stringify(config)
  const host = VirtualHost.create({
    '/experiments': {
      'valid.ts': `export const experiment = ${serializedConfig}`,
      'types.d.ts': `export const experiment = ${serializedConfig}`,
      'index.ts': `export const experiment = ${serializedConfig}`,
      'unsupported.json': serializedConfig,
      'missing.ts': 'export const value = true',
      'invalid.ts': 'export const experiment = {}',
    },
  })

  await expect(
    listExperiments({
      host,
      experimentsDirectory: '/experiments',
      scenariosDirectory: '/scenarios',
    }),
  ).resolves.toEqual([
    {
      ...resolveConfig(config),
      id: 'valid',
      filepath: '/experiments/valid.ts',
    },
  ])
})

test('listExperiments throws when the directory does not exist', async () => {
  const host = VirtualHost.create()

  await expect(
    listExperiments({
      host,
      experimentsDirectory: '/experiments',
      scenariosDirectory: '/scenarios',
    }),
  ).rejects.toThrow('Experiments directory does not exist: /experiments')
})

test('listExperiments throws when the path is not a directory', async () => {
  const host = VirtualHost.create({
    '/experiments': '',
  })

  await expect(
    listExperiments({
      host,
      experimentsDirectory: '/experiments',
      scenariosDirectory: '/scenarios',
    }),
  ).rejects.toThrow('Experiments path is not a directory: /experiments')
})

test('getExperiment returns the experiment matching the id', async () => {
  const serializedConfig = JSON.stringify(config)
  const host = VirtualHost.create({
    '/experiments': {
      'first.ts': `export const experiment = ${serializedConfig}`,
      'second.ts': `export const experiment = ${serializedConfig}`,
    },
  })

  await expect(
    getExperiment({
      host,
      experimentsDirectory: '/experiments',
      scenariosDirectory: '/scenarios',
      id: 'second',
    }),
  ).resolves.toEqual({
    ...resolveConfig(config),
    id: 'second',
    filepath: '/experiments/second.ts',
  })
})

test('getExperiment throws when the experiment is not found', async () => {
  const host = VirtualHost.create({
    '/experiments': {},
  })

  await expect(
    getExperiment({
      host,
      experimentsDirectory: '/experiments',
      scenariosDirectory: '/scenarios',
      id: 'missing',
    }),
  ).rejects.toThrow('Experiment "missing" was not found in: /experiments')
})

test('serializes and deserializes experiment identity and result maps', () => {
  const experimentOutput = output('baseline', [])
  const serialized = serialize(experimentOutput)

  expect(JSON.parse(serialized)).toEqual({
    experimentId: 'baseline',
    scenarios: {},
    treatments: {},
    trials: {},
  })
  expect(deserialize(serialized)).toEqual({
    experimentId: 'baseline',
    scenarios: new Map(),
    treatments: new Map(),
    trials: new Map(),
  })
})

test('creates portable artifact paths relative to the output directory', () => {
  const trialResult: TrialResult = {
    artifacts: {
      directory: '/bundle/artifacts/trial',
      copilotConfigDirectory: '/bundle/artifacts/trial/.copilot',
      skillsConfigDirectory: '/bundle/artifacts/trial/.agents',
      testResultsPath: '/bundle/artifacts/trial/workspace/test-results.json',
      workspaceDirectory: '/bundle/artifacts/trial/workspace',
    },
    trial: {
      id: 'trial',
      scenario: {
        id: 'scenario',
        directory: '/scenarios/scenario',
        prompt: 'Complete the task',
        tags: [],
        testPath: '/scenarios/scenario/scenario.test.ts',
      },
      treatment: {
        name: 'Control',
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
      type: 'Screenshot',
      filepath: '/bundle/artifacts/trial/walkthrough/screenshot.png',
    },
  }

  const portableOutput = output('baseline', [trialResult], {
    baseDirectory: '/bundle',
  })

  expect(portableOutput.trials.get('trial')).toEqual(
    expect.objectContaining({
      artifacts: {
        directory: 'artifacts/trial',
        copilotConfigDirectory: 'artifacts/trial/.copilot',
        skillsConfigDirectory: 'artifacts/trial/.agents',
        testResultsPath: 'artifacts/trial/workspace/test-results.json',
        workspaceDirectory: 'artifacts/trial/workspace',
      },
      walkthrough: {
        type: 'Screenshot',
        filepath: 'artifacts/trial/walkthrough/screenshot.png',
      },
    }),
  )
})
