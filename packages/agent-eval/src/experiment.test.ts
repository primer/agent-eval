import path from 'node:path'
import {expect, test} from 'vitest'
import {
  createPlan,
  defineConfig,
  getExperiment,
  listExperiments,
  merge,
  output,
  read,
  resolvePlan,
  write,
  type Experiment,
} from './experiment'
import {VirtualHost} from './host'
import type {TrialResult} from './trial'
import {deserialize as deserializePlan, isBenchmarkPlan} from './plan'

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

test('creates experiment identity and result maps', () => {
  const experimentOutput = output('baseline', [])

  expect(experimentOutput).toEqual({
    experimentId: 'baseline',
    scenarios: new Map(),
    treatments: new Map(),
    trials: new Map(),
  })
})

test('creates portable artifact paths relative to the output directory', async () => {
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

  const host = VirtualHost.create()
  await write('/bundle/output.json', portableOutput, {host})

  expect(JSON.parse(await host.fs.readFile('/bundle/output.json', 'utf-8'))).toEqual({
    experimentId: 'baseline',
    scenarios: {
      scenario: expect.objectContaining({
        id: 'scenario',
      }),
    },
    treatments: {
      Control: {
        name: 'Control',
      },
    },
    trials: {
      trial: 'artifacts/trial/trial.json',
    },
  })
  expect(JSON.parse(await host.fs.readFile('/bundle/artifacts/trial/trial.json', 'utf-8'))).toEqual(
    portableOutput.trials.get('trial'),
  )
  await expect(read('/bundle/output.json', {host})).resolves.toEqual(portableOutput)

  await host.fs.writeFile(
    '/bundle/embedded-output.json',
    JSON.stringify({
      experimentId: portableOutput.experimentId,
      scenarios: Object.fromEntries(portableOutput.scenarios),
      treatments: Object.fromEntries(portableOutput.treatments),
      trials: Object.fromEntries(portableOutput.trials),
    }),
    'utf-8',
  )
  await expect(read('/bundle/embedded-output.json', {host})).rejects.toThrow()

  host.vol.renameSync('/bundle/artifacts', '/outside')
  host.vol.symlinkSync('/outside', '/bundle/artifacts')
  await expect(read('/bundle/output.json', {host})).rejects.toThrow('must not resolve outside the output directory')
  await expect(write('/bundle/output.json', portableOutput, {host})).rejects.toThrow(
    'must not resolve outside the output directory',
  )

  const secondOutput = output('baseline', [
    {
      ...trialResult,
      trial: {
        ...trialResult.trial,
        id: 'trial-two',
      },
    },
  ])
  const merged = merge([portableOutput, secondOutput])

  expect([...merged.trials.keys()]).toEqual(['trial', 'trial-two'])
  expect(() => {
    merge([portableOutput, portableOutput])
  }).toThrow('Cannot merge duplicate trial id: trial')
  expect(() => {
    merge([portableOutput, output('different', [])])
  }).toThrow('Cannot merge experiment outputs for different sources')
})

test('resolves durable experiment plans with experiment and treatment setup functions', () => {
  const experimentSetup = async () => {
    return undefined
  }
  const treatmentSetup = async () => {
    return undefined
  }
  const experiment: Experiment = {
    id: 'test-experiment',
    filepath: '/experiments/test-experiment.ts',
    name: 'Test experiment',
    description: 'Tests durable plans',
    models: [
      {
        name: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
      },
    ],
    scenarios: [
      {
        id: '001-scenario',
        directory: '/scenarios/001-scenario',
        prompt: 'Complete the task',
        tags: [],
        testPath: '/scenarios/001-scenario/scenario.test.ts',
      },
    ],
    setup: experimentSetup,
    treatments: [
      {
        name: 'Treatment',
        setup: treatmentSetup,
      },
    ],
  }

  const plan = createPlan(experiment)
  const resolved = resolvePlan(experiment, plan)
  const treatmentTrial = resolved.trials.find(trial => trial.treatment.name === 'Treatment')

  expect(resolved.trials.map(trial => trial.id)).toEqual(plan.trials.map(trial => trial.id))
  expect(treatmentTrial?.setup).toBe(experimentSetup)
  expect(treatmentTrial?.treatment.setup).toBe(treatmentSetup)
})

test('rejects experiment plans with references missing from the current config', () => {
  const scenario = {
    id: '001-scenario',
    directory: '/scenarios/001-scenario',
    prompt: 'Complete the task',
    tags: [],
    testPath: '/scenarios/001-scenario/scenario.test.ts',
  }
  const experiment: Experiment = {
    id: 'test-experiment',
    filepath: '/experiments/test-experiment.ts',
    name: 'Test experiment',
    description: 'Tests durable plans',
    models: [
      {
        name: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
      },
    ],
    scenarios: [scenario],
    treatments: [],
  }
  const missingScenarioPlan = deserializePlan({
    version: 1,
    source: {
      kind: 'experiment',
      id: experiment.id,
    },
    trials: [
      {
        id: 'trial',
        scenarioId: 'missing-scenario',
        treatmentId: 'Control',
        model: experiment.models[0],
      },
    ],
  })

  if (isBenchmarkPlan(missingScenarioPlan)) {
    throw new Error('Expected experiment plan')
  }

  expect(() => {
    resolvePlan(experiment, missingScenarioPlan)
  }).toThrow('Plan trial "trial" references missing scenario: missing-scenario')

  const missingTreatmentPlan = deserializePlan({
    version: 1,
    source: {
      kind: 'experiment',
      id: experiment.id,
    },
    trials: [
      {
        id: 'trial',
        scenarioId: scenario.id,
        treatmentId: 'Missing treatment',
        model: experiment.models[0],
      },
    ],
  })

  if (isBenchmarkPlan(missingTreatmentPlan)) {
    throw new Error('Expected experiment plan')
  }

  expect(() => {
    resolvePlan(experiment, missingTreatmentPlan)
  }).toThrow('Plan trial "trial" references missing treatment: Missing treatment')

  const missingModelPlan = deserializePlan({
    version: 1,
    source: {
      kind: 'experiment',
      id: experiment.id,
    },
    trials: [
      {
        id: 'trial',
        scenarioId: scenario.id,
        treatmentId: 'Control',
        model: {
          name: 'gpt-5.6-sol',
          reasoningEffort: 'high',
        },
      },
    ],
  })

  if (isBenchmarkPlan(missingModelPlan)) {
    throw new Error('Expected experiment plan')
  }

  expect(() => {
    resolvePlan(experiment, missingModelPlan)
  }).toThrow('Plan trial "trial" references missing model variant: gpt-5.6-sol/high')
})
