import {expect, test} from 'vitest'
import {getExperimentResults} from './experiment-results'
import {createResult, createRun} from './test/experiment'

test('distinguishes missing runs from runs with no trials', () => {
  expect(getExperimentResults(undefined)).toBeNull()
  expect(getExperimentResults(createRun([]))).toEqual({
    date: '2026-09-10',
    treatments: [],
    scenarios: [
      {id: 'scenario-a', treatments: []},
      {id: 'scenario-b', treatments: []},
    ],
  })
})

test('sums test counts and averages resource usage per trial, not per scenario', () => {
  const first = createResult()
  const second = createResult({
    id: 'trial-2',
    assistant: {
      ...first.assistant,
      outputTokens: 300,
      premiumRequests: 3,
      sessionDurationMs: 6000,
      totalApiDurationMs: 3000,
    },
    testResults: {...first.testResults, numPassedTests: 1, numTotalTests: 2},
  })
  const third = createResult({id: 'trial-3', scenarioId: 'scenario-b'})
  const summary = getExperimentResults(createRun([first, second, third]))

  expect(summary?.treatments).toEqual([
    {
      id: JSON.stringify(['control', 'gpt-5.6-sol', 'medium']),
      treatment: 'Control',
      model: 'gpt-5.6-sol',
      reasoningEffort: 'medium',
      trials: 3,
      scenarios: 2,
      passedTests: 7,
      totalTests: 10,
      passRate: 0.7,
      outputTokens: 500 / 3,
      premiumRequests: 5 / 3,
      sessionDurationMs: 10000 / 3,
      totalApiDurationMs: 5000 / 3,
    },
  ])
  expect(summary?.scenarios[0].treatments[0]).toMatchObject({
    trials: 2,
    scenarios: 1,
    passedTests: 4,
    totalTests: 6,
    passRate: 4 / 6,
    outputTokens: 200,
  })
  expect(summary?.scenarios[1].treatments[0]).toMatchObject({trials: 1, passedTests: 3, totalTests: 4})
})

test('keeps treatments, models, and reasoning efforts separate with stable ordering', () => {
  const trials = [
    createResult({id: 'skill', treatmentId: 'skill'}),
    createResult({id: 'other-model', model: 'gpt-5.6-luna'}),
    createResult({id: 'high', reasoningEffort: 'high'}),
    createResult({id: 'default', reasoningEffort: undefined}),
    createResult(),
  ]
  const summary = getExperimentResults(createRun(trials))
  expect(summary?.treatments).toHaveLength(5)
  expect(
    summary?.treatments.every(result => {
      return result.trials === 1
    }),
  ).toBe(true)
  expect(
    summary?.treatments.some(result => {
      return result.reasoningEffort === 'Default'
    }),
  ).toBe(true)
  expect(getExperimentResults(createRun(trials.toReversed()))).toEqual(summary)
})

test('shows no-test results as unavailable rather than zero or perfect performance', () => {
  const result = createResult()
  result.testResults.numPassedTests = 0
  result.testResults.numTotalTests = 0
  result.assistant.outputTokens = 0

  expect(getExperimentResults(createRun([result]))?.treatments[0]).toMatchObject({
    trials: 1,
    passRate: null,
    passedTests: 0,
    totalTests: 0,
    outputTokens: 0,
  })
})

test('preserves recorded scenario and treatment IDs even when metadata is absent', () => {
  const result = createResult({treatmentId: 'historical-treatment', scenarioId: 'historical-scenario'})
  const summary = getExperimentResults(createRun([result]))
  expect(summary?.scenarios[0]).toMatchObject({
    id: 'historical-scenario',
    treatments: [{treatment: 'historical-treatment'}],
  })
})
