import assert from 'node:assert/strict'
import {expect, expectTypeOf, test} from 'vitest'
import {VirtualHost} from '../host'
import type {CopilotRunner} from '../copilot-runner'
import {ExperimentConfigSchema} from './config'
import {getExperiment} from './get'
import {createExperimentPlan, createExperimentPlanManifest, parseExperimentPlanManifest} from './plan'
import {VirtualSandbox} from '../sandbox'
import {getExperimentScenarios, type BenchmarkExperiment, type ScenarioExperiment} from './experiment'
import type {BenchmarkTrial} from '../benchmark/plan'
import type {Trial} from '../trial/trial'

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
  {runners: ['copilot-sdk', 'copilot-sdk'], expected: ['copilot-sdk']},
] satisfies Array<{runners: Array<CopilotRunner> | undefined; expected: Array<CopilotRunner>}>)(
  'expands and restores the runner dimension: $runners',
  async ({runners, expected}) => {
    const host = createHost(runners)
    const options = {host, experimentsDirectory: '/experiments', scenariosDirectory: '/scenarios'}
    const experiment = await getExperiment({...options, name: 'example'})
    const plan = createExperimentPlan({experiment})
    assert(plan.type === 'scenarios')
    expectTypeOf(plan.experiment).toEqualTypeOf<ScenarioExperiment>()
    expectTypeOf(plan.experiment).not.toHaveProperty('benchmark')
    expectTypeOf(plan.plan.trials).toEqualTypeOf<Array<Trial>>()
    expectTypeOf(plan.plan.trials[0]).not.toHaveProperty('capability')
    expect(plan.plan.trials).toHaveLength(4 * expected.length)
    expect(
      new Set(
        plan.plan.trials.map(trial => {
          return trial.id
        }),
      ).size,
    ).toBe(plan.plan.trials.length)
    for (const runner of expected) {
      expect(
        plan.plan.trials.filter(trial => {
          return trial.runner === runner
        }),
      ).toHaveLength(4)
    }

    const manifest = createExperimentPlanManifest({plan})
    const parsed = await parseExperimentPlanManifest({...options, contents: JSON.stringify(manifest)})
    expect(parsed.plan.trials).toEqual(plan.plan.trials)
  },
)

test('restores legacy plans without a runner as CLI trials', async () => {
  const options = {host: createHost(), experimentsDirectory: '/experiments', scenariosDirectory: '/scenarios'}
  const experiment = await getExperiment({...options, name: 'example'})
  const plan = createExperimentPlan({experiment})
  const manifest = createExperimentPlanManifest({plan})
  const {type: _type, ...untagged} = manifest
  expect(_type).toBe('scenarios')
  const legacy = {
    ...untagged,
    trials: manifest.trials.map(({runner: _runner, ...trial}) => {
      expect(_runner).toBe('copilot-cli')
      return trial
    }),
  }
  const parsed = await parseExperimentPlanManifest({...options, contents: JSON.stringify(legacy)})
  expect(parsed.type).toBe('scenarios')
  expect(parsed.plan.trials).toEqual(plan.plan.trials)
})

test('preserves an explicit runner override when restoring a plan', async () => {
  const options = {host: createHost(), experimentsDirectory: '/experiments', scenariosDirectory: '/scenarios'}
  const experiment = await getExperiment({...options, name: 'example'})
  const plan = createExperimentPlan({experiment, runner: 'copilot-sdk'})
  const manifest = createExperimentPlanManifest({plan})
  const parsed = await parseExperimentPlanManifest({...options, contents: JSON.stringify(manifest)})
  expect(parsed.plan.trials).toEqual(plan.plan.trials)
  expect(
    parsed.plan.trials.every(trial => {
      return trial.runner === 'copilot-sdk'
    }),
  ).toBe(true)
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

function createBenchmarkHost() {
  return VirtualHost.create({
    '/experiments/example.ts': `export default {
      name: 'Example', description: 'Compare a benchmark', models: ['gpt-5.5'],
      benchmark: 'suite', runners: ['copilot-cli', 'copilot-sdk'],
      async setup({sandbox}) { await sandbox.writeFile('shared.txt', 'experiment') },
      treatments: [{name: 'Skill', async setup({sandbox}) { await sandbox.writeFile('skill.txt', 'skill') }}],
    }`,
    '/benchmarks/suite.ts': `export default {
      name: 'Suite', description: 'Suite', models: ['claude-opus-5'],
      async setup({sandbox}) { await sandbox.writeFile('benchmark.txt', 'benchmark') },
      capabilities: [
        {name: 'First', scenarios: ['example'], async setup({sandbox}) { await sandbox.writeFile('shared.txt', 'capability') }},
        {name: 'Second', scenarios: ['example']},
      ],
    }`,
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {prompt: "Create a page"}',
  })
}

test('requires an explicit benchmarks directory for benchmark-backed experiments', async () => {
  await expect(
    getExperiment({
      host: createBenchmarkHost(),
      experimentsDirectory: '/experiments',
      scenariosDirectory: '/scenarios',
      benchmarksDirectory: undefined,
      name: 'example',
    }),
  ).rejects.toThrow('benchmarksDirectory is required for benchmark-backed experiment: example')
})

test('runs both references and custom treatments for every capability membership and runner', async () => {
  const host = createBenchmarkHost()
  const options = {
    host,
    experimentsDirectory: '/experiments',
    benchmarksDirectory: '/benchmarks',
    scenariosDirectory: '/scenarios',
  }
  const experiment = await getExperiment({...options, name: 'example'})

  const plan = createExperimentPlan({experiment})
  const manifest = createExperimentPlanManifest({plan})
  const restored = await parseExperimentPlanManifest({...options, contents: JSON.stringify(manifest)})

  assert(plan.type === 'benchmark')
  assert(restored.type === 'benchmark')
  expectTypeOf(plan.experiment).toEqualTypeOf<BenchmarkExperiment>()
  expectTypeOf(plan.experiment).not.toHaveProperty('scenarios')
  expectTypeOf(plan.plan.trials).toEqualTypeOf<Array<BenchmarkTrial>>()
  expectTypeOf(restored.plan.trials).toEqualTypeOf<Array<BenchmarkTrial>>()
  expect(getExperimentScenarios(experiment)).toHaveLength(1)
  expect(plan.plan.trials).toHaveLength(12)
  expect(
    new Set(
      plan.plan.trials.map(trial => {
        return trial.model.name
      }),
    ),
  ).toEqual(new Set(['gpt-5.5']))
  expect(
    restored.plan.trials.map(trial => {
      return [trial.id, trial.capability.name, trial.scenario.id, trial.treatment.name, trial.runner]
    }),
  ).toEqual(
    plan.plan.trials.map(trial => {
      return [trial.id, trial.capability.name, trial.scenario.id, trial.treatment.name, trial.runner]
    }),
  )
  for (const name of ['Control', 'Benchmark', 'Skill']) {
    const trial = restored.plan.trials.find(trial => {
      return trial.capability.name === 'First' && trial.treatment.name === name
    })!
    const sandboxHost = VirtualHost.create()
    await using sandbox = await VirtualSandbox.create({host: sandboxHost})
    await trial.setup?.({sandbox})
    await trial.treatment.setup?.({sandbox})
    await expect(sandbox.readFile('shared.txt')).resolves.toBe('experiment')
    await expect(sandbox.exists('benchmark.txt')).resolves.toBe(name === 'Benchmark')
    await expect(sandbox.exists('skill.txt')).resolves.toBe(name === 'Skill')
  }
})

test('rejects invalid capability membership and benchmark drift when replaying a plan', async () => {
  const host = createBenchmarkHost()
  const options = {
    host,
    experimentsDirectory: '/experiments',
    benchmarksDirectory: '/benchmarks',
    scenariosDirectory: '/scenarios',
  }
  const experiment = await getExperiment({...options, name: 'example'})
  const manifest = createExperimentPlanManifest({plan: createExperimentPlan({experiment})})
  assert(manifest.type === 'benchmark')
  const invalid = {...manifest, trials: [{...manifest.trials[0], capabilityId: 'unknown'}]}

  await expect(parseExperimentPlanManifest({...options, contents: JSON.stringify(invalid)})).rejects.toThrow(
    'Invalid capability',
  )
  const changed = {...manifest, benchmark: {...manifest.benchmark, name: 'Changed suite'}}
  await expect(parseExperimentPlanManifest({...options, contents: JSON.stringify(changed)})).rejects.toThrow(
    'Benchmark definition changed',
  )
})

test.each([
  {
    name: 'missing capability',
    change: (manifest: Record<string, unknown>, trial: Record<string, unknown>) => {
      const {capabilityId: _capabilityId, ...withoutCapability} = trial
      expect(_capabilityId).toBeTypeOf('string')
      return {
        ...manifest,
        trials: [withoutCapability],
      }
    },
    error: 'capabilityId',
  },
  {
    name: 'missing benchmark metadata',
    change: (manifest: Record<string, unknown>) => {
      const {benchmark: _benchmark, ...withoutBenchmark} = manifest
      expect(_benchmark).toBeTypeOf('object')
      return withoutBenchmark
    },
    error: 'benchmark',
  },
  {
    name: 'scenario discriminant with benchmark metadata',
    change: (manifest: Record<string, unknown>) => {
      return {
        ...manifest,
        type: 'scenarios',
      }
    },
    error: 'benchmark',
  },
  {
    name: 'unknown source discriminant',
    change: (manifest: Record<string, unknown>) => {
      return {
        ...manifest,
        type: 'unknown',
      }
    },
    error: 'type',
  },
])('rejects structurally invalid benchmark plans: $name', async ({change, error}) => {
  const options = {
    host: createBenchmarkHost(),
    experimentsDirectory: '/experiments',
    benchmarksDirectory: '/benchmarks',
    scenariosDirectory: '/scenarios',
  }
  const experiment = await getExperiment({...options, name: 'example'})
  const manifest = createExperimentPlanManifest({plan: createExperimentPlan({experiment})})
  const invalid = change(manifest, manifest.trials[0])

  await expect(parseExperimentPlanManifest({...options, contents: JSON.stringify(invalid)})).rejects.toThrow(error)
})

test('rejects capability metadata on scenario experiment trials', async () => {
  const options = {
    host: createHost(),
    experimentsDirectory: '/experiments',
    scenariosDirectory: '/scenarios',
  }
  const experiment = await getExperiment({...options, name: 'example'})
  const manifest = createExperimentPlanManifest({plan: createExperimentPlan({experiment})})
  const invalid = {
    ...manifest,
    trials: [
      {
        ...manifest.trials[0],
        capabilityId: 'unexpected',
      },
    ],
  }

  await expect(parseExperimentPlanManifest({...options, contents: JSON.stringify(invalid)})).rejects.toThrow(
    'capabilityId',
  )
})

test.each(['scenarios', 'benchmark'] as const)(
  'rejects replay after the experiment source changes from %s',
  async type => {
    const options = {
      host: type === 'scenarios' ? createHost() : createBenchmarkHost(),
      experimentsDirectory: '/experiments',
      benchmarksDirectory: '/benchmarks',
      scenariosDirectory: '/scenarios',
    }
    const experiment = await getExperiment({...options, name: 'example'})
    const manifest = createExperimentPlanManifest({plan: createExperimentPlan({experiment})})
    const changedHost = type === 'scenarios' ? createBenchmarkHost() : createHost()

    await expect(
      parseExperimentPlanManifest({
        ...options,
        host: changedHost,
        contents: JSON.stringify(manifest),
      }),
    ).rejects.toThrow('Experiment source changed')
  },
)

test('restores untagged benchmark plans with required capability membership', async () => {
  const options = {
    host: createBenchmarkHost(),
    experimentsDirectory: '/experiments',
    benchmarksDirectory: '/benchmarks',
    scenariosDirectory: '/scenarios',
  }
  const experiment = await getExperiment({...options, name: 'example'})
  const plan = createExperimentPlan({experiment})
  const {type: _type, ...legacy} = createExperimentPlanManifest({plan})
  expect(_type).toBe('benchmark')

  const restored = await parseExperimentPlanManifest({...options, contents: JSON.stringify(legacy)})

  assert(restored.type === 'benchmark')
  expect(
    restored.plan.trials.map(trial => {
      return [trial.id, trial.capability.id]
    }),
  ).toEqual(
    legacy.trials.map(trial => {
      assert('capabilityId' in trial)
      return [trial.id, trial.capabilityId]
    }),
  )
})

test.each([
  {benchmark: 'suite', scenarios: ['example'], treatments: []},
  {treatments: []},
  {benchmark: 'suite', treatments: [{name: 'Benchmark'}]},
  {benchmark: 'suite', treatments: [{name: 'Control'}]},
])('rejects ambiguous sources and reserved benchmark treatment names: %j', input => {
  expect(
    ExperimentConfigSchema.safeParse({
      name: 'Example',
      description: 'Example',
      models: ['gpt-5.5'],
      ...input,
    }).success,
  ).toBe(false)
})
