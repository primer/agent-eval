import {expect, test} from 'vitest'
import {getBenchmarkExperimentResults} from './benchmark-experiment-results'
import {createResult, createRun} from './test/experiment'
import {checks} from './test-fixtures'

function createBenchmarkRun(trials = [createResult({capabilityId: 'a'})]) {
  const run = createRun(trials)
  run.output.benchmark = {
    id: 'suite',
    name: 'Saved suite',
    capabilities: {
      a: {id: 'a', name: 'First capability', scenarioIds: ['scenario-a', 'scenario-b']},
      b: {id: 'b', name: 'Second capability', scenarioIds: ['scenario-a']},
    },
  }
  run.output.treatments.set('benchmark', {id: 'benchmark', name: 'Benchmark'})
  return run
}

test('compares treatments within capability, model, effort and runner without merging shared scenarios', () => {
  const trial = createResult({capabilityId: 'a'})
  const results = getBenchmarkExperimentResults(
    createBenchmarkRun([
      trial,
      createResult({
        id: 'benchmark',
        capabilityId: 'a',
        treatmentId: 'benchmark',
        agent: {
          sessions: [
            {
              ...trial.agent.sessions[0],
              outputTokens: 200,
            },
          ],
        },
      }),
      createResult({id: 'skill', capabilityId: 'a', treatmentId: 'skill'}),
      createResult({id: 'other-capability', capabilityId: 'b', checks: []}),
      createResult({id: 'sdk', capabilityId: 'a', runner: 'copilot-sdk', checks: []}),
      createResult({id: 'high', capabilityId: 'a', model: {...trial.model, reasoningEffort: 'high'}}),
    ]),
  )
  const first = results.capabilities[0]
  const variantId = JSON.stringify(['gpt-5.6-sol', 'medium', 'copilot-cli'])
  const control = first.treatments.find(result => {
    return result.treatmentId === 'control' && result.variantId === variantId
  })!

  expect(results.variants).toHaveLength(3)
  expect(control).toMatchObject({
    trials: 1,
    scenarios: 1,
    metrics: {outputTokens: {value: 100, raw: '100', comparisons: {benchmark: '100 (-50.0%)', control: '100 (0%)'}}},
  })
  expect(first.scenarios[1]).toEqual({id: 'scenario-b', treatments: []})
  expect(results.capabilities[1].treatments).toHaveLength(1)
  expect(results.capabilities[1].treatments[0].metrics[results.metrics[0].id].raw).toBe(
    'N/A [0/1 check results with values]',
  )
})

test('preserves check dimensions and notes, with unavailable deltas for missing references', () => {
  const results = getBenchmarkExperimentResults(
    createBenchmarkRun([
      createResult({capabilityId: 'a', treatmentId: 'skill', checks}),
      createResult({id: 'missing', capabilityId: 'a', treatmentId: 'skill', checks: []}),
    ]),
  )
  const treatment = results.capabilities[0].treatments[0]
  const measurement = results.metrics.find(metric => {
    return metric.label.startsWith('Measurements')
  })!
  const outcomes = results.metrics.find(metric => {
    return metric.label === 'Checks (pass %)'
  })!

  expect(treatment.metrics[measurement.id]).toMatchObject({
    value: 15,
    raw: '15 ms [1/2 check results with values; 1 error]',
  })
  expect(treatment.metrics[outcomes.id]).toMatchObject({
    value: 50,
    raw: '50.0% [1/2 check results with values; 1 skipped; 1 error]',
    comparisons: {benchmark: '50.0% (N/A) [1/2 check results with values; 1 skipped; 1 error]'},
  })
  expect(treatment.metrics.outputTokens.comparisons.benchmark).toBe('100 (N/A)')
})

test('keeps the saved hierarchy visible even when no trials were recorded', () => {
  const results = getBenchmarkExperimentResults(createBenchmarkRun([]))

  expect(results.name).toBe('Saved suite')
  expect(results.variants).toEqual([])
  expect(
    results.capabilities.map(capability => {
      return {name: capability.name, treatments: capability.treatments}
    }),
  ).toEqual([
    {name: 'First capability', treatments: []},
    {name: 'Second capability', treatments: []},
  ])
  expect(
    results.treatments.map(treatment => {
      return treatment.name
    }),
  ).toEqual(['Control', 'Benchmark', 'With skill'])
})
