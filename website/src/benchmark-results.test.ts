import type {CheckOutput} from '@primer/agent-eval'
import {expect, test} from 'vitest'
import {getBenchmarkOverviewData, getBenchmarkPageResults, type BenchmarkRun} from './benchmark-results'
import {formatChecks, summarizeTrials} from './check-results'
import {createBenchmarkOutput, createTrial, session} from './test-fixtures'

function outcomes(statuses: Array<'passed' | 'failed' | 'skipped'>): Array<CheckOutput> {
  return [
    {
      check: {name: 'tests', files: []},
      result: {
        type: 'outcomes',
        outcomes: statuses.map(status => {
          return {type: 'outcome', status}
        }),
      },
    },
  ]
}

function run(output = createBenchmarkOutput(), date = '2026-09-15'): BenchmarkRun {
  return {id: date, name: date, date: new Date(date), directory: '/results', output}
}

test('uses equal-weight per-check per-trial means, excluding skips and errors rather than pooling assertions', () => {
  const summary = summarizeTrials([
    createTrial({checks: outcomes(['passed'])}),
    createTrial({id: 'trial-2', checks: outcomes(['failed', 'failed', 'failed', 'skipped'])}),
  ])
  expect(formatChecks(summary)).toBe('50.0% [1 skipped]')
  expect(summary.outputTokens).toBe(200)
})

test('keeps outcome and measurement units separate and preserves missing checks', () => {
  const summary = summarizeTrials([createTrial()])
  expect(formatChecks(summary)).toBe('15 ms [1 error]; 50.0% [1 skipped; 1 error]')
  expect(formatChecks(summarizeTrials([createTrial({checks: []})]))).toBe('N/A')
  expect(formatChecks(summarizeTrials([createTrial({checks: outcomes(['skipped'])})]))).toBe(
    'N/A [0/1 check results with values; 1 skipped]',
  )
})

test('compares and ranks models using check performance before implementation-only usage', () => {
  const output = createBenchmarkOutput([
    createTrial({id: 'control', checks: outcomes(['failed'])}),
    createTrial({id: 'benchmark', treatmentId: 'benchmark', checks: outcomes(['passed'])}),
    createTrial({
      id: 'other-control',
      model: {name: 'claude-opus-5', reasoningEffort: 'medium'},
      checks: outcomes(['failed']),
    }),
    createTrial({
      id: 'other-benchmark',
      treatmentId: 'benchmark',
      model: {name: 'claude-opus-5', reasoningEffort: 'medium'},
      checks: outcomes(['failed']),
      agent: {sessions: [{...session, outputTokens: 1}]},
    }),
  ])
  const overview = getBenchmarkOverviewData([run(output)])
  expect(
    overview.results.map(result => {
      return result.model
    }),
  ).toEqual(['gpt-5.6-sol', 'claude-opus-5'])
  expect(overview.results[0].comparison).toMatchObject({checks: '100.0% (N/A)', outputTokens: '100 (0%)'})
  const page = getBenchmarkPageResults(run(output))
  expect(page?.scenarios).toHaveLength(1)
  expect(page).not.toHaveProperty('capabilities')
  expect(
    overview.trends.every(point => {
      return !('capabilityId' in point)
    }),
  ).toBe(true)
})

test('charts measurements and outcomes separately and leaves absent treatments null, not zero', () => {
  const overview = getBenchmarkOverviewData([run()])
  const point = overview.trends.find(candidate => {
    return candidate.scenarioId === null
  })
  expect(point?.metrics.outputTokens).toMatchObject({value: null, raw: 'N/A', change: null, controlValue: 100})
  const measurement = overview.metrics.find(metric => {
    return metric.unit === 'ms'
  })
  const outcome = overview.metrics.find(metric => {
    return metric.percentage
  })
  expect(measurement).toBeDefined()
  expect(outcome).toBeDefined()
  expect(point?.metrics[measurement!.id]).toMatchObject({value: null, controlValue: 15})
  expect(point?.metrics[outcome!.id]).toMatchObject({value: null, controlValue: 50})
})

test('does not report zero percent change for missing outcome data', () => {
  const output = createBenchmarkOutput([
    createTrial({checks: outcomes(['skipped'])}),
    createTrial({id: 'benchmark', treatmentId: 'benchmark', checks: outcomes(['skipped'])}),
  ])
  expect(getBenchmarkOverviewData([run(output)]).results[0].comparison.checks).toContain('N/A (N/A)')
})

test('fills missing historical metric dimensions with null and keeps changed units distinct', () => {
  const current = run(
    createBenchmarkOutput([
      createTrial({
        checks: [
          {
            check: {name: 'performance', files: []},
            result: {type: 'measurements', id: 'render', unit: 's', measurements: [{type: 'measurement', value: 2}]},
          },
        ],
      }),
    ]),
  )
  const previous = run(createBenchmarkOutput(), '2026-09-14')
  const overview = getBenchmarkOverviewData([current, previous])
  expect(
    overview.metrics.filter(metric => {
      return metric.label.includes('performance')
    }),
  ).toHaveLength(2)
  for (const point of overview.trends) {
    expect(Object.keys(point.metrics).sort()).toEqual(
      overview.metrics
        .map(metric => {
          return metric.id
        })
        .sort(),
    )
  }
})

test('surfaces legacy runs and uses the latest available run without treating legacy data as zero', () => {
  const overview = getBenchmarkOverviewData([
    {...run(), output: null, unavailableReason: 'Legacy format'},
    run(createBenchmarkOutput(), '2026-09-14'),
  ])
  expect(overview.date).toBe('2026-09-14')
  expect(overview.unavailableRuns).toEqual([{date: '2026-09-15', reason: 'Legacy format'}])
  expect(getBenchmarkPageResults({...run(), output: null, unavailableReason: 'Legacy format'})).toBeNull()
})

test('shows empty current outputs as unmeasured without requiring treatment metadata', () => {
  const output = {...createBenchmarkOutput([]), treatments: new Map()}
  const overview = getBenchmarkOverviewData([run(output)])
  expect(overview.results).toEqual([])
  expect(overview.trends).toEqual([])
  expect(getBenchmarkPageResults(run(output))).toMatchObject({
    comparison: {checks: 'N/A', outputTokens: 'N/A'},
    scenarios: [],
  })
})

test('rejects unexpected benchmark treatments instead of silently excluding their trials', () => {
  expect(() => {
    return getBenchmarkOverviewData([run(createBenchmarkOutput([createTrial({treatmentId: 'unknown'})]))])
  }).toThrow('Unexpected benchmark treatment')
})

test('preserves small measurement values and reports partially missing trial coverage in raw trends', () => {
  const output = createBenchmarkOutput([
    createTrial({
      checks: [
        {
          check: {name: 'small', files: []},
          result: {type: 'measurements', unit: 's', measurements: [{type: 'measurement', value: 0.00004}]},
        },
      ],
    }),
    createTrial({id: 'missing', checks: []}),
  ])
  const overview = getBenchmarkOverviewData([run(output)])
  const metric = overview.metrics.find(definition => {
    return definition.label.includes('small')
  })
  expect(metric).toBeDefined()
  const point = overview.trends[0].metrics[metric!.id]
  expect(point.controlValue).toBe(0.00004)
  expect(point.controlRaw).toBe('0.00004 s [1/2 check results with values]')
})
