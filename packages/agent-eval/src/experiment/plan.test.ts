import {expect, test} from 'vitest'
import {VirtualHost} from '../host'
import type {CopilotRunner} from '../copilot-runner'
import {ExperimentConfigSchema} from './config'
import {getExperiment} from './get'
import {createExperimentPlan, createExperimentPlanManifest, parseExperimentPlanManifest} from './plan'
import {VirtualSandbox} from '../sandbox'

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
  const options = {host: createHost(), experimentsDirectory: '/experiments', scenariosDirectory: '/scenarios'}
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

test('preserves an explicit runner override when restoring a plan', async () => {
  const options = {host: createHost(), experimentsDirectory: '/experiments', scenariosDirectory: '/scenarios'}
  const experiment = await getExperiment({...options, name: 'example'})
  const plan = createExperimentPlan({experiment, runner: 'copilot-sdk'})
  const manifest = createExperimentPlanManifest({experiment, plan})
  const parsed = await parseExperimentPlanManifest({...options, contents: JSON.stringify(manifest)})
  expect(parsed.trials).toEqual(plan.trials)
  expect(
    parsed.trials.every(trial => {
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
  const manifest = createExperimentPlanManifest({experiment, plan})
  const restored = await parseExperimentPlanManifest({...options, contents: JSON.stringify(manifest)})

  expect(experiment.scenarios).toHaveLength(1)
  expect(plan.trials).toHaveLength(12)
  expect(
    new Set(
      plan.trials.map(trial => {
        return trial.model.name
      }),
    ),
  ).toEqual(new Set(['gpt-5.5']))
  expect(
    restored.trials.map(trial => {
      return [trial.id, trial.capability?.name, trial.scenario.id, trial.treatment.name, trial.runner]
    }),
  ).toEqual(
    plan.trials.map(trial => {
      return [trial.id, trial.capability?.name, trial.scenario.id, trial.treatment.name, trial.runner]
    }),
  )
  for (const name of ['Control', 'Benchmark', 'Skill']) {
    const trial = restored.trials.find(trial => {
      return trial.capability?.name === 'First' && trial.treatment.name === name
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
  const manifest = createExperimentPlanManifest({experiment, plan: createExperimentPlan({experiment})})
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
