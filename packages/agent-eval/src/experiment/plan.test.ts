import {expect, expectTypeOf, test} from 'vitest'
import {VirtualHost} from '../host'
import type {CopilotRunner} from '../copilot-runner'
import {VirtualSandbox} from '../sandbox'
import {ExperimentConfigSchema} from './config'
import {getExperiment} from './get'
import {createExperimentPlan, createExperimentPlanManifest, parseExperimentPlanManifest} from './plan'

function createHost(runners?: Array<CopilotRunner>) {
  return VirtualHost.create({
    '/experiments/example.ts': `export default ${JSON.stringify({
      name: 'Example',
      description: 'Compare runners',
      models: [{name: 'gpt-5.5', reasoningEfforts: ['medium', 'high']}],
      scenarios: ['example'],
      treatments: [{name: 'Skill'}],
      runners,
    })}`,
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {prompt: "Create a page"}',
  })
}

test.each([
  {runners: undefined, expected: ['copilot-cli']},
  {runners: ['copilot-sdk'], expected: ['copilot-sdk']},
  {runners: ['copilot-cli', 'copilot-sdk'], expected: ['copilot-cli', 'copilot-sdk']},
] satisfies Array<{runners: Array<CopilotRunner> | undefined; expected: Array<CopilotRunner>}>)(
  'expands and restores the runner dimension: $runners',
  async ({runners, expected}) => {
    const host = createHost(runners)
    const options = {
      host,
      benchmarksDirectory: '/benchmarks',
      experimentsDirectory: '/experiments',
      scenariosDirectory: '/scenarios',
    }
    const experiment = await getExperiment({...options, name: 'example'})
    const plan = createExperimentPlan({experiment})
    expectTypeOf(plan.trials[0].runner).toEqualTypeOf<CopilotRunner>()
    expect(plan.trials).toHaveLength(4 * expected.length)
    expect(
      new Set(
        plan.trials.map(trial => {
          return trial.id
        }),
      ).size,
    ).toBe(plan.trials.length)
    for (const runner of expected) {
      expect(
        plan.trials.filter(trial => {
          return trial.runner === runner
        }),
      ).toHaveLength(4)
    }

    const manifest = createExperimentPlanManifest({experiment, plan})
    const parsed = await parseExperimentPlanManifest({...options, contents: JSON.stringify(manifest)})
    expect(parsed.trials).toEqual(plan.trials)
  },
)

test('restores legacy plans without a runner as CLI trials', async () => {
  const options = {
    host: createHost(),
    benchmarksDirectory: '/benchmarks',
    experimentsDirectory: '/experiments',
    scenariosDirectory: '/scenarios',
  }
  const experiment = await getExperiment({...options, name: 'example'})
  const plan = createExperimentPlan({experiment})
  const manifest = createExperimentPlanManifest({experiment, plan})
  const legacy = {
    ...manifest,
    trials: manifest.trials.map(({runner: _runner, ...trial}) => {
      expect(_runner).toBe('copilot-cli')
      return trial
    }),
  }
  const parsed = await parseExperimentPlanManifest({...options, contents: JSON.stringify(legacy)})
  expect(parsed.trials).toEqual(plan.trials)
})

test.each([undefined, 'components'])(
  'rejects duplicate experiment trial IDs before loading configuration: %s',
  async capabilityId => {
    const trial = {
      id: 'duplicate',
      model: {
        name: 'gpt-5.5',
        reasoningEffort: 'medium',
      },
      scenarioId: 'example',
      treatmentId: 'control',
      capabilityId,
    }

    await expect(
      parseExperimentPlanManifest({
        host: VirtualHost.create(),
        benchmarksDirectory: '/benchmarks',
        experimentsDirectory: '/experiments',
        scenariosDirectory: '/scenarios',
        contents: JSON.stringify({
          id: 'missing',
          name: 'Example',
          trials: [trial, trial],
        }),
      }),
    ).rejects.toMatchObject({
      issues: [
        {
          path: ['trials', 1, 'id'],
          message: 'Duplicate trial ID in experiment plan: duplicate',
        },
      ],
    })
  },
)

test('preserves repeated experiment trial combinations with distinct IDs', async () => {
  const options = {
    host: createHost(),
    benchmarksDirectory: '/benchmarks',
    experimentsDirectory: '/experiments',
    scenariosDirectory: '/scenarios',
  }
  const experiment = await getExperiment({...options, name: 'example'})
  const plan = createExperimentPlan({experiment})
  const manifest = createExperimentPlanManifest({experiment, plan})
  manifest.trials.push({
    ...manifest.trials[0],
    id: 'repeat',
  })

  const parsed = await parseExperimentPlanManifest({...options, contents: JSON.stringify(manifest)})

  expect(parsed.trials).toEqual([
    ...plan.trials,
    {
      ...plan.trials[0],
      id: 'repeat',
    },
  ])
})

test('expands and restores benchmark experiment control, benchmark, and custom treatments', async () => {
  const host = VirtualHost.create({
    '/experiments/example.ts': `export default ${JSON.stringify({
      id: 'pinned-experiment',
      name: 'Example',
      description: 'Compare benchmark treatments',
      models: ['gpt-5.5'],
      runners: ['copilot-cli', 'copilot-sdk'],
      benchmark: 'design-system',
      treatments: [{name: 'Skill'}],
    })}`,
    '/benchmarks/design-system.ts': `export default ${JSON.stringify({
      id: 'pinned-benchmark',
      name: 'Design System',
      description: 'Example benchmark',
      models: ['gpt-5.5'],
      capabilities: [{name: 'Components', scenarios: ['example']}],
    })}`,
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {prompt: "Create a page"}',
  })
  const options = {
    host,
    benchmarksDirectory: '/benchmarks',
    experimentsDirectory: '/experiments',
    scenariosDirectory: '/scenarios',
  }
  const experiment = await getExperiment({...options, name: 'example'})
  const plan = createExperimentPlan({experiment})

  expect(experiment.id).toBe('pinned-experiment')
  expect(experiment.type).toBe('benchmark')
  if (experiment.type === 'benchmark') {
    expect(experiment.benchmark.id).toBe('pinned-benchmark')
  }
  expect(plan.trials).toHaveLength(6)
  for (const runner of ['copilot-cli', 'copilot-sdk']) {
    expect(
      plan.trials
        .filter(trial => {
          return trial.runner === runner
        })
        .map(trial => {
          return trial.treatment.name
        })
        .sort(),
    ).toEqual(['Benchmark', 'Control', 'Skill'])
  }

  const manifest = createExperimentPlanManifest({experiment, plan})
  const parsed = await parseExperimentPlanManifest({...options, contents: JSON.stringify(manifest)})

  expect(parsed.trials).toEqual(
    plan.trials.map(trial => {
      return {
        ...trial,
        setup: expect.any(Function),
      }
    }),
  )
})

test('preserves shared setup order and treatment isolation in created and restored benchmark experiment plans', async () => {
  const host = VirtualHost.create({
    '/experiments/example.ts': `export default {
      name: 'Example',
      description: 'Compare benchmark treatments',
      models: ['gpt-5.5'],
      benchmark: 'design-system',
      async setup({sandbox}) {
        await sandbox.writeFile('/setup.txt', 'experiment')
      },
      treatments: [{
        name: 'Skill',
        async setup({sandbox}) {
          await sandbox.writeFile('/setup.txt', await sandbox.readFile('/setup.txt') + ',skill')
        },
      }],
    }`,
    '/benchmarks/design-system.ts': `export default {
      name: 'Design System',
      description: 'Example benchmark',
      models: ['gpt-5.5'],
      async setup({sandbox}) {
        await sandbox.writeFile('/setup.txt', await sandbox.readFile('/setup.txt') + ',benchmark')
      },
      capabilities: ['Components', 'Layouts'].map(name => {
        return {
          name,
          scenarios: ['example'],
          async setup({sandbox}) {
            await sandbox.writeFile('/setup.txt', await sandbox.readFile('/setup.txt') + ',' + name)
          },
        }
      }),
    }`,
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {prompt: "Create a page"}',
  })
  const options = {
    host,
    benchmarksDirectory: '/benchmarks',
    experimentsDirectory: '/experiments',
    scenariosDirectory: '/scenarios',
  }
  const experiment = await getExperiment({...options, name: 'example'})
  const plan = createExperimentPlan({experiment})
  const manifest = createExperimentPlanManifest({experiment, plan})
  const parsed = await parseExperimentPlanManifest({...options, contents: JSON.stringify(manifest)})
  const plans: Array<typeof parsed.trials> = [plan.trials, parsed.trials]

  for (const trials of plans) {
    expect(trials).toHaveLength(6)
    for (const trial of trials) {
      if (!('capability' in trial)) {
        throw new Error('Expected a benchmark trial')
      }
      await using sandbox = await VirtualSandbox.create()
      const sharedSetup = `experiment,${trial.capability.name}`

      await trial.setup?.({sandbox})

      expect(await sandbox.readFile('/setup.txt')).toBe(sharedSetup)

      await trial.treatment.setup?.({sandbox})

      if (trial.treatment.name === 'Control') {
        expect(await sandbox.readFile('/setup.txt')).toBe(sharedSetup)
      } else if (trial.treatment.name === 'Benchmark') {
        expect(await sandbox.readFile('/setup.txt')).toBe(`${sharedSetup},benchmark`)
      } else {
        expect(trial.treatment.name).toBe('Skill')
        expect(await sandbox.readFile('/setup.txt')).toBe(`${sharedSetup},skill`)
      }
    }
  }
})

test.each([{runners: []}, {runners: ['sdk']}, {runners: ['unknown']}])(
  'rejects invalid runner configuration: %j',
  ({runners}) => {
    expect(
      ExperimentConfigSchema.safeParse({
        name: 'Example',
        description: 'Example',
        models: ['gpt-5.5'],
        scenarios: ['example'],
        treatments: [],
        runners,
      }).success,
    ).toBe(false)
  },
)
