import {describe, expect, test} from 'vitest'
import {createExperimentOverview} from './experiment-results'
import type {RunOutput, RunOutputResult} from './runs'

function trial(overrides: Partial<RunOutputResult> = {}): RunOutputResult {
  return {
    id: 'trial',
    scenarioId: 'button',
    treatmentId: 'Control',
    model: 'gpt-5.6-luna',
    reasoningEffort: 'low',
    assistant: {
      logs: [],
      turns: 4,
      outputTokens: 1000,
      premiumRequests: 1,
      sessionDurationMs: 2000,
      totalApiDurationMs: 1000,
      tools: {},
    },
    testResults: {
      numTotalTests: 4,
      numPassedTests: 2,
      numFailedTests: 2,
      numPendingTests: 0,
      numTodoTests: 0,
      success: false,
      testResults: [],
      tests: [],
    },
    walkthrough: {type: 'Unavailable'},
    ...overrides,
  }
}

function output(results: Array<RunOutputResult>): RunOutput {
  return {
    experiment: {id: 'experiment', models: [{name: 'gpt-5.6-luna', reasoningEfforts: ['low']}]},
    scenarios: ['button', 'form'].map(id => ({
      id,
      directory: `/scenarios/${id}`,
      prompt: 'Build an accessible interface',
      testPath: `/scenarios/${id}/scenario.test.ts`,
      tags: [],
    })),
    treatments: [
      {id: 'Control', config: {name: 'Baseline'}},
      {id: 'instructions', config: {name: 'Instructions'}},
    ],
    results,
  }
}

describe('createExperimentOverview', () => {
  test('compares test pass rates in percentage points and per-trial resource means in percent', () => {
    const baseline = trial()
    const treatment = trial({
      treatmentId: 'instructions',
      assistant: {...baseline.assistant, outputTokens: 750, turns: 6},
      testResults: {...baseline.testResults, numPassedTests: 3, numFailedTests: 1},
    })
    const overview = createExperimentOverview(output([baseline, treatment]))

    expect(overview.results[0]).toMatchObject({
      treatmentId: 'Control',
      treatment: 'Baseline',
      comparison: 'control',
      passRate: 50,
      passRateDelta: null,
    })
    expect(overview.results[1]).toMatchObject({
      treatmentId: 'instructions',
      comparison: 'matched',
      trialCount: 1,
      scenarioCount: 1,
      passedTests: 3,
      totalTests: 4,
      passRate: 75,
      passRateDelta: 25,
      means: {outputTokens: 750, turns: 6},
      resourceDeltas: {outputTokens: -25, turns: 50, premiumRequests: 0},
    })
  })

  test('aggregates every repeated trial and scenario, weighting pass rate by test count', () => {
    const baseline = trial()
    const other = trial({
      id: 'other',
      scenarioId: 'form',
      assistant: {...baseline.assistant, outputTokens: 2000},
      testResults: {...baseline.testResults, numPassedTests: 1, numTotalTests: 1, numFailedTests: 0},
    })
    const results = [baseline, trial({id: 'repeat'}), other]
    const overview = createExperimentOverview(
      output([...results, ...results.map(result => ({...result, id: `${result.id}-t`, treatmentId: 'instructions'}))]),
    )

    expect(overview.results[0]).toMatchObject({
      trialCount: 3,
      scenarioCount: 2,
      passedTests: 5,
      totalTests: 9,
    })
    expect(overview.results[0].passRate).toBeCloseTo((5 / 9) * 100)
    expect(overview.results[0].means.outputTokens).toBeCloseTo(4000 / 3)
    expect(overview.results[1].comparison).toBe('matched')
    expect(overview.scenarios.map(scenario => scenario.id)).toEqual(['button', 'form'])
    expect(overview.scenarios[0].results[0]).toMatchObject({trialCount: 2, passedTests: 4, totalTests: 8})
    expect(overview.scenarios[1].results[0]).toMatchObject({trialCount: 1, passRate: 100})
  })

  test('does not compare different models or reasoning efforts against each other', () => {
    const overview = createExperimentOverview(
      output([
        trial(),
        trial({treatmentId: 'instructions', reasoningEffort: 'high'}),
        trial({treatmentId: 'instructions', model: 'gpt-5.6-sol'}),
      ]),
    )
    const treatmentsWithTrials = overview.results.filter(row => row.treatmentId === 'instructions' && row.trialCount)

    expect(treatmentsWithTrials).toHaveLength(2)
    expect(treatmentsWithTrials.every(row => row.comparison === 'missing-control' && row.passRateDelta === null)).toBe(
      true,
    )
    expect(new Set(overview.results.map(row => row.id)).size).toBe(overview.results.length)
  })

  test('treats absent reasoning effort as a distinct model variant', () => {
    const overview = createExperimentOverview(
      output([trial({reasoningEffort: undefined}), trial({reasoningEffort: undefined, treatmentId: 'instructions'})]),
    )
    expect(
      overview.results.find(row => row.treatmentId === 'instructions' && row.reasoningEffort === null),
    ).toMatchObject({
      comparison: 'matched',
      passRateDelta: 0,
    })
  })

  test('withholds aggregate deltas for different scenario coverage but compares matched scenarios', () => {
    const overview = createExperimentOverview(
      output([trial(), trial({scenarioId: 'form'}), trial({treatmentId: 'instructions'})]),
    )

    expect(overview.results[1]).toMatchObject({comparison: 'unbalanced', passRateDelta: null})
    expect(Object.values(overview.results[1].resourceDeltas)).toEqual([null, null, null, null, null])
    expect(overview.scenarios[0].results[1].comparison).toBe('matched')
    expect(overview.scenarios[1].results[1].comparison).toBe('no-trials')
  })

  test('requires matching per-scenario repetition counts even when total trial counts match', () => {
    const overview = createExperimentOverview(
      output([
        trial(),
        trial({id: 'repeat'}),
        trial({scenarioId: 'form'}),
        trial({treatmentId: 'instructions'}),
        trial({treatmentId: 'instructions', scenarioId: 'form'}),
        trial({treatmentId: 'instructions', scenarioId: 'form', id: 'repeat-treatment'}),
      ]),
    )
    expect(overview.results[1]).toMatchObject({trialCount: 3, comparison: 'unbalanced', passRateDelta: null})
  })

  test('reports missing controls without inferring a baseline from display name or ordering', () => {
    const data = output([trial({treatmentId: 'instructions'})])
    data.treatments = [{id: 'instructions', config: {name: 'Control'}}]
    const overview = createExperimentOverview(data)

    expect(overview.results[0]).toMatchObject({comparison: 'missing-control', passRateDelta: null})
  })

  test('shows unavailable rates and percent changes for zero tests and zero-valued control metrics', () => {
    const baseline = trial()
    baseline.assistant.outputTokens = 0
    baseline.testResults.numTotalTests = 0
    baseline.testResults.numPassedTests = 0
    const overview = createExperimentOverview(output([baseline, trial({treatmentId: 'instructions'})]))

    expect(overview.results[0].passRate).toBeNull()
    expect(overview.results[1]).toMatchObject({
      comparison: 'matched',
      passRateDelta: null,
      resourceDeltas: {outputTokens: null},
    })
  })

  test('retains configured rows and scenarios without inventing measurements for empty runs', () => {
    const overview = createExperimentOverview(output([]))

    expect(overview.results).toHaveLength(2)
    for (const row of overview.results) {
      expect(row).toMatchObject({
        trialCount: 0,
        scenarioCount: 0,
        passRate: null,
        comparison: 'no-trials',
        passRateDelta: null,
      })
      expect(Object.values(row.means)).toEqual([null, null, null, null, null])
    }
    expect(overview.scenarios).toHaveLength(2)
  })

  test('keeps recorded scenarios and treatments even if absent from the metadata', () => {
    const overview = createExperimentOverview(output([trial({scenarioId: 'unlisted', treatmentId: 'unlisted'})]))

    expect(overview.scenarios.map(scenario => scenario.id)).toEqual(['button', 'form', 'unlisted'])
    expect(overview.results.find(row => row.treatmentId === 'unlisted')).toMatchObject({
      treatment: 'unlisted',
      trialCount: 1,
      comparison: 'missing-control',
    })
  })

  test('keeps treatments with duplicate display names separate and does not mutate input', () => {
    const data = output([trial(), trial({treatmentId: 'instructions'})])
    data.treatments[1].config.name = 'Baseline'
    const before = structuredClone(data)
    const overview = createExperimentOverview(data)

    expect(overview.results.map(row => row.treatmentId)).toEqual(['Control', 'instructions'])
    expect(overview.results[1].comparison).toBe('matched')
    expect(data).toEqual(before)
  })
})
