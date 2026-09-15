import {renderToStaticMarkup} from 'react-dom/server'
import type {Route} from 'next'
import {expect, test} from 'vitest'
import {createExperimentRunDetails} from '../../run-details'
import {createExperimentOutput, createTrial} from '../../test-fixtures'
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

test('explains unavailable runs instead of rendering an empty result panel', () => {
  const html = renderToStaticMarkup(
    <RunDetailsPage
      resource={resource}
      run={{
        date: '2026-09-15',
        results: [],
        unavailableReason: 'Regenerate this legacy run.',
      }}
    />,
  )
  expect(html).toContain('Regenerate this legacy run.')
  expect(html).not.toContain('No trial results were recorded.')
})
