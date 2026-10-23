import {renderToStaticMarkup} from 'react-dom/server'
import {expect, test} from 'vitest'
import {getBenchmarkOverviewData, getBenchmarkPageResults, type BenchmarkRun} from '../../benchmark-results'
import {getExperimentResults} from '../../experiment-results'
import {createBenchmarkOutput, createErrorTrial, createTrial} from '../../test-fixtures'
import {createResult, createRun} from '../../test/experiment'
import {BenchmarkOverview} from './BenchmarkOverview'
import {ExperimentsOverview} from './ExperimentResults'
import {Page as BenchmarkPage} from '../benchmarks/[id]/components/Page'
import {Page as ExperimentPage} from '../experiments/[id]/components/Page'
import {getRunSummary} from '../../evaluation-state'

const benchmark = {
  id: 'example',
  name: 'Example',
  description: 'Example benchmark',
  models: [],
  capabilities: [],
}

test('benchmark overview and detail pages mark the latest incomplete evaluation without partial comparisons', () => {
  const output = createBenchmarkOutput([
    createErrorTrial(),
    createTrial({
      scenarioId: 'successful-scenario',
      treatmentId: 'benchmark',
    }),
  ])
  const run: BenchmarkRun = {
    id: '2026-09-15',
    name: '2026-09-15',
    directory: '/results',
    date: new Date('2026-09-15'),
    output,
  }
  const overview = renderToStaticMarkup(
    <BenchmarkOverview benchmark={benchmark} overview={getBenchmarkOverviewData([run])} />,
  )
  const page = renderToStaticMarkup(
    <BenchmarkPage
      benchmark={benchmark}
      results={getBenchmarkPageResults(run)}
      runs={[
        {
          id: run.id,
          name: run.name,
          resultCount: 2,
          ...getRunSummary(output.trials.values()),
        },
      ]}
    />,
  )

  for (const html of [overview, page]) {
    expect(html).toContain('Incomplete evaluation')
    expect(html).toContain('Failed to start sandbox')
    expect(html).toContain('/benchmarks/example/runs/2026-09-15')
    expect(html).not.toContain('Capability performance')
    expect(html).not.toContain('Output tokens</')
    expect(html).not.toContain('No results have been recorded')
  }
  expect(page).toContain('Incomplete (1 trial error)')
})

test('experiment overview and run listings expose incompleteness instead of unrelated successful treatment averages', () => {
  const run = createRun([
    createErrorTrial(),
    createResult({
      scenarioId: 'scenario-b',
      treatmentId: 'skill',
    }),
  ])
  const results = getExperimentResults(run)
  const experiment = {
    id: 'example',
    name: 'Example',
    description: 'Example experiment',
    models: [],
    scenarios: [],
    treatments: [],
  }
  const overview = renderToStaticMarkup(
    <ExperimentsOverview
      experiments={[
        {
          ...experiment,
          date: run.name,
          results,
        },
      ]}
    />,
  )
  const page = renderToStaticMarkup(
    <ExperimentPage
      experiment={experiment}
      results={results}
      runs={[
        {
          id: run.id,
          name: run.name,
          resultCount: 2,
          ...getRunSummary(run.output.trials.values()),
        },
      ]}
    />,
  )

  for (const html of [overview, page]) {
    expect(html).toContain('Incomplete evaluation')
    expect(html).toContain('/experiments/example/runs/2026-09-10')
    expect(html).not.toContain('No trial results were recorded')
    expect(html).not.toContain('Output tokens')
    expect(html).not.toContain('With skill')
  }
  expect(page).toContain('Unavailable (incomplete evaluation)')
})
