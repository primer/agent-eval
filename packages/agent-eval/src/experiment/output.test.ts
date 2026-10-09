import {expect, expectTypeOf, test} from 'vitest'
import type {CopilotRunner} from '../copilot-runner'
import {ExperimentTrialOutputSchema, type ExperimentTrialOutput} from './output'

const trial = {
  id: 'trial',
  model: {
    name: 'gpt-5.5',
    reasoningEffort: 'medium',
  },
  scenarioId: 'example',
  treatmentId: 'control',
  agent: {
    sessions: [],
  },
  artifacts: {
    directory: '/artifacts/trial',
    copilotConfigDirectory: '/artifacts/trial/copilot',
    skillsConfigDirectory: '/artifacts/trial/skills',
    walkthroughDirectory: '/artifacts/trial/walkthrough',
    workspaceDirectory: '/artifacts/trial/workspace',
  },
  checks: [],
  judges: [],
  walkthrough: {
    type: 'Unavailable',
  },
}

test('parses legacy experiment output with a required CLI runner', () => {
  const parsed = ExperimentTrialOutputSchema.parse(trial)

  expect(parsed.runner).toBe('copilot-cli')
  expectTypeOf<ExperimentTrialOutput['runner']>().toEqualTypeOf<CopilotRunner>()
})

test.each(['copilot-cli', 'copilot-sdk'] as const)('preserves the explicit %s experiment output runner', runner => {
  const parsed = ExperimentTrialOutputSchema.parse({
    ...trial,
    runner,
  })

  expect(parsed.runner).toBe(runner)
})

test.each([null, 'unknown'])('rejects an invalid experiment output runner: %s', runner => {
  expect(() => {
    ExperimentTrialOutputSchema.parse({
      ...trial,
      runner,
    })
  }).toThrow()
})
