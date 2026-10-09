import {expect, expectTypeOf, test} from 'vitest'
import type {CopilotRunner} from '../copilot-runner'
import {parseBenchmarkTrialOutput, type BenchmarkTrialOutput} from './output'

const trial = {
  id: 'trial',
  model: {
    name: 'gpt-5.5',
    reasoningEffort: 'medium',
  },
  capabilityId: 'components',
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

const capabilities = new Map([
  [
    'components',
    {
      id: 'components',
      name: 'Components',
      scenarioIds: ['example'],
    },
  ],
])

test('parses legacy benchmark output with a required CLI runner', () => {
  const parsed = parseBenchmarkTrialOutput(trial, capabilities)

  expect(parsed.runner).toBe('copilot-cli')
  expectTypeOf<BenchmarkTrialOutput['runner']>().toEqualTypeOf<CopilotRunner>()
})

test.each(['copilot-cli', 'copilot-sdk'] as const)('preserves the explicit %s benchmark output runner', runner => {
  const parsed = parseBenchmarkTrialOutput(
    {
      ...trial,
      runner,
    },
    capabilities,
  )

  expect(parsed.runner).toBe(runner)
})

test.each([null, 'unknown'])('rejects an invalid benchmark output runner: %s', runner => {
  expect(() => {
    parseBenchmarkTrialOutput(
      {
        ...trial,
        runner,
      },
      capabilities,
    )
  }).toThrow()
})
