import {renderToStaticMarkup} from 'react-dom/server'
import {expect, test} from 'vitest'
import {getBenchmarkExperimentResults} from '../../benchmark-experiment-results'
import {createResult, createRun} from '../../test/experiment'
import {BenchmarkExperimentMatrix} from './BenchmarkExperimentResults'

test('renders capability comparisons with both references, coverage, and unavailable cells', () => {
  const run = createRun([createResult({capabilityId: 'a'})])
  run.output.benchmark = {
    id: 'suite',
    name: 'Saved suite',
    capabilities: {
      a: {id: 'a', name: 'Recorded capability', scenarioIds: ['scenario-a']},
      b: {id: 'b', name: 'Missing capability', scenarioIds: ['scenario-b']},
    },
  }
  run.output.treatments.set('benchmark', {id: 'benchmark', name: 'Benchmark'})

  const html = renderToStaticMarkup(
    <BenchmarkExperimentMatrix experimentId="example" date={run.name} results={getBenchmarkExperimentResults(run)} />,
  )

  expect(html).toContain('Capability treatment comparisons')
  expect(html).toContain('Recorded capability')
  expect(html).toContain('Missing capability')
  expect(html).toContain('Compare against')
  expect(html).toMatch(/<option(?=[^>]*value="benchmark")(?=[^>]*selected="")[^>]*>Benchmark<\/option>/)
  expect(html).toContain('75.0% (N/A)')
  expect(html).toContain('N/A (no trials)')
  expect(html).toContain('1 trials / 1 scenarios')
  expect(html).not.toContain('Scenario treatment comparisons')
})
