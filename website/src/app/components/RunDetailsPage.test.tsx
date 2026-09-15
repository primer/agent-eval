import {renderToStaticMarkup} from 'react-dom/server'
import type {Route} from 'next'
import {expect, test} from 'vitest'
import {createBenchmarkRunDetails, createExperimentRunDetails} from '../../run-details'
import {createBenchmarkOutput, createExperimentOutput, createTrial} from '../../test-fixtures'
import {RunDetailsPage} from './RunDetailsPage'

const resource = {
  id: 'noop',
  name: 'Noop',
  collectionLabel: 'Experiments',
  collectionHref: '/experiments' as const,
  href: '/experiments/noop' as Route,
}

test('provides a selector for every repeated trial and the new checks tab', async () => {
  const run = await createExperimentRunDetails(
    '2026-09-15',
    createExperimentOutput([createTrial(), createTrial({id: 'trial-2'})]),
    '/results',
  )
  const html = renderToStaticMarkup(<RunDetailsPage resource={resource} run={run} />)
  expect(html).toContain('Trial 1 (trial-1)')
  expect(html).toContain('Trial 2 (trial-2)')
  expect(html).toContain('result-0-checks-tab')
  expect(html).not.toContain('Tests passed')
})

test('renders an empty state for a current run without trials', () => {
  const html = renderToStaticMarkup(
    <RunDetailsPage
      resource={resource}
      run={{
        date: '2026-09-15',
        results: [],
      }}
    />,
  )
  expect(html).toContain('No trial results were recorded.')
})

test('keeps a shared scenario separate per capability and exposes capability filtering', async () => {
  const run = await createBenchmarkRunDetails({
    id: '2026-09-15',
    name: '2026-09-15',
    date: new Date('2026-09-15'),
    directory: '/results',
    output: createBenchmarkOutput([
      {...createTrial(), capabilityId: 'a'},
      {...createTrial({id: 'trial-2'}), capabilityId: 'b'},
    ]),
  })
  const html = renderToStaticMarkup(<RunDetailsPage resource={resource} run={run} />)
  expect(html).toContain('First capability / empty-state')
  expect(html).toContain('Overlapping capability / empty-state')
  expect(html).toContain('All capabilities')
  expect(html).toContain('value="a"')
  expect(html).toContain('value="b"')
})
