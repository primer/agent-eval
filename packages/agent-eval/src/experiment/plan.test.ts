import {expect, test} from 'vitest'
import {VirtualHost} from '../host'
import type {CopilotRunner} from '../copilot-runner'
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
