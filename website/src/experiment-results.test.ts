import {expect, test} from 'vitest'
import {getExperimentResults} from './experiment-results'
import {createResult, createRun} from './test/experiment'
import {checks, judges} from './test-fixtures'

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

test('averages checks and implementation usage per trial, not per scenario or outcome', () => {
  const first = createResult()
  const second = createResult({
    id: 'trial-2',
    agent: {
      sessions: [
        {
          ...first.agent.sessions[0],
          outputTokens: 150,
          premiumRequests: 1.5,
          sessionDurationMs: 3000,
          totalApiDurationMs: 1500,
        },
        {
          ...first.agent.sessions[0],
          outputTokens: 150,
          premiumRequests: 1.5,
          sessionDurationMs: 3000,
          totalApiDurationMs: 1500,
        },
      ],
    },
    checks: [
      {
        check: {name: 'tests', files: []},
        result: {
          type: 'outcomes',
          outcomes: [
            {type: 'outcome', status: 'passed'},
            {type: 'outcome', status: 'failed'},
          ],
        },
      },
    ],
    judges,
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
      checks: '66.7%',
      outputTokens: 500 / 3,
      premiumRequests: 5 / 3,
      aiCredits: 2 / 3,
      sessionDurationMs: 10000 / 3,
      totalApiDurationMs: 5000 / 3,
    },
  ])
  expect(summary?.scenarios[0].treatments[0]).toMatchObject({
    trials: 2,
    scenarios: 1,
    checks: '62.5%',
    outputTokens: 200,
  })
  expect(summary?.scenarios[1].treatments[0]).toMatchObject({trials: 1, checks: '75.0%'})
})

test('keeps treatments, models, and reasoning efforts separate with stable ordering', () => {
  const trials = [
    createResult({id: 'skill', treatmentId: 'skill'}),
    createResult({id: 'other-model', model: {name: 'gpt-5.6-luna', reasoningEffort: 'medium'}}),
    createResult({id: 'high', model: {name: 'gpt-5.6-sol', reasoningEffort: 'high'}}),
    createResult(),
  ]
  const summary = getExperimentResults(createRun(trials))
  expect(summary?.treatments).toHaveLength(4)
  expect(
    summary?.treatments.every(result => {
      return result.trials === 1
    }),
  ).toBe(true)
  expect(getExperimentResults(createRun(trials.toReversed()))).toEqual(summary)
})

test('shows results without checks as unavailable rather than zero or perfect performance', () => {
  const result = createResult({checks: [], agent: {sessions: []}})

  expect(getExperimentResults(createRun([result]))?.treatments[0]).toMatchObject({
    trials: 1,
    checks: 'N/A',
    outputTokens: 0,
  })
})

test('preserves measurement units, skipped outcomes, errors, and missing check values', () => {
  const summary = getExperimentResults(createRun([createResult({checks}), createResult({id: 'no-checks', checks: []})]))
  expect(summary?.treatments[0].checks).toBe(
    '15 ms [1/2 check results with values; 1 error]; 50.0% [1/2 check results with values; 1 skipped; 1 error]',
  )
})

test('preserves recorded scenario and treatment IDs even when metadata is absent', () => {
  const result = createResult({treatmentId: 'historical-treatment', scenarioId: 'historical-scenario'})
  const summary = getExperimentResults(createRun([result]))
  expect(summary?.scenarios[0]).toMatchObject({
    id: 'historical-scenario',
    treatments: [{treatment: 'historical-treatment'}],
  })
})
