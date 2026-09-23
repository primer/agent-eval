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
  expect(
    page?.capabilities.map(capability => {
      return capability.id
    }),
  ).toEqual(['a', 'b'])
  expect(
    overview.trends.every(point => {
      return point.capabilityId === null || point.capabilityId === 'a'
    }),
  ).toBe(true)
})

test('isolates capability comparisons and trends when the same scenario appears in multiple capabilities', () => {
  const output = createBenchmarkOutput([
    {
      ...createTrial({
        id: 'a-control',
        checks: outcomes(['passed', 'failed']),
        agent: {sessions: [{...session, outputTokens: 50}]},
      }),
      capabilityId: 'a',
    },
    {...createTrial({id: 'a-benchmark', treatmentId: 'benchmark', checks: outcomes(['passed'])}), capabilityId: 'a'},
    {
      ...createTrial({
        id: 'b-control',
        checks: outcomes(['passed']),
        agent: {sessions: [{...session, outputTokens: 300}]},
      }),
      capabilityId: 'b',
    },
    {
      ...createTrial({
        id: 'b-benchmark',
        treatmentId: 'benchmark',
        checks: outcomes(['failed']),
        agent: {sessions: [{...session, outputTokens: 400}]},
      }),
      capabilityId: 'b',
    },
  ])
  const page = getBenchmarkPageResults(run(output))
  expect(page?.comparison).toMatchObject({checks: '50.0% (-33.3%)', outputTokens: '500 (+42.9%)'})
  expect(page?.capabilities[0].comparison).toMatchObject({checks: '100.0% (+100.0%)', outputTokens: '100 (+100.0%)'})
  expect(page?.capabilities[1].comparison).toMatchObject({checks: '0.0% (-100.0%)', outputTokens: '400 (+33.3%)'})
  for (const capability of page!.capabilities) {
    expect(capability.scenarios).toHaveLength(1)
    expect(capability.scenarios[0].models[0].comparison).toEqual(capability.comparison)
  }
  const overview = getBenchmarkOverviewData([run(output)])
  expect(
    new Set(
      overview.trends.map(point => {
        return point.id
      }),
    ).size,
  ).toBe(overview.trends.length)
  for (const scenarioId of [null, 'empty-state']) {
    const a = overview.trends.find(point => {
      return point.capabilityId === 'a' && point.scenarioId === scenarioId
    })
    const b = overview.trends.find(point => {
      return point.capabilityId === 'b' && point.scenarioId === scenarioId
    })
    expect(a?.metrics.outputTokens).toMatchObject({value: 100, controlValue: 50, change: 100})
    expect(b?.metrics.outputTokens).toMatchObject({value: 400, controlValue: 300})
  }
})

test('compares AI credits and reports sessions without usage totals as unmeasured', () => {
  const sessionWithoutCredits = {...session, aiCredits: undefined}
  const output = createBenchmarkOutput([
    createTrial({id: 'control', agent: {sessions: [{...session, aiCredits: 0.25}]}}),
    createTrial({
      id: 'benchmark',
      treatmentId: 'benchmark',
      agent: {sessions: [{...session, aiCredits: 0.5}]},
    }),
  ])
  const overview = getBenchmarkOverviewData([run(output)])
  expect(overview.results[0].comparison.aiCredits).toBe('0.5 (+100.0%)')
  expect(overview.trends[0].metrics.aiCredits).toMatchObject({value: 0.5, controlValue: 0.25, change: 100})
  expect(
    overview.metrics.find(metric => {
      return metric.id === 'aiCredits'
    }),
  ).toEqual({id: 'aiCredits', label: 'AI credits'})

  const withoutCredits = createBenchmarkOutput([
    createTrial({id: 'control', agent: {sessions: [sessionWithoutCredits]}}),
    createTrial({id: 'benchmark', treatmentId: 'benchmark', agent: {sessions: [sessionWithoutCredits]}}),
  ])
  const missing = getBenchmarkOverviewData([run(withoutCredits)])
  expect(missing.results[0].comparison.aiCredits).toBe('N/A')
  expect(missing.trends[0].metrics.aiCredits).toMatchObject({value: null, raw: 'N/A', controlValue: null})
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

test('uses the latest loaded run and handles an empty run list', () => {
  const overview = getBenchmarkOverviewData([run(createBenchmarkOutput(), '2026-09-14')])
  expect(overview.date).toBe('2026-09-14')
  expect(getBenchmarkOverviewData([])).toMatchObject({date: null, results: [], trends: []})
  expect(getBenchmarkPageResults(undefined)).toBeNull()
})

test('shows empty current outputs as unmeasured without requiring treatment metadata', () => {
  const output = {...createBenchmarkOutput([]), treatments: new Map()}
  const overview = getBenchmarkOverviewData([run(output)])
  expect(overview.results).toEqual([])
  expect(overview.trends).toEqual([])
  expect(getBenchmarkPageResults(run(output))).toMatchObject({
    comparison: {checks: 'N/A', outputTokens: 'N/A'},
    scenarios: [],
    capabilities: [
      {id: 'a', scenarios: [{id: 'empty-state', comparison: {checks: 'N/A'}, models: []}]},
      {id: 'b', scenarios: [{id: 'empty-state', comparison: {checks: 'N/A'}, models: []}]},
    ],
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
