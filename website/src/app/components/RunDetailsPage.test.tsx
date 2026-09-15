import {renderToStaticMarkup} from 'react-dom/server'
import type {Route} from 'next'
import {expect, test} from 'vitest'
import {createBenchmarkRunDetails, createExperimentRunDetails} from '../../run-details'
import {createBenchmarkOutput, createExperimentOutput, createTrial} from '../../test-fixtures'
import {RunDetailsPage, UiWalkthrough} from './RunDetailsPage'

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
  )
  const html = renderToStaticMarkup(<RunDetailsPage resource={resource} run={run} />)
  expect(html).toContain('Trial 1 (trial-1)')
  expect(html).toContain('Trial 2 (trial-2)')
  expect(html).toContain('result-0-checks-tab')
  expect(html).not.toContain('Tests passed')
  expect(html).toContain('Loading trial details')
  expect(html).not.toContain('empty state renders')
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

test.each([true, false])('uses eager loading only for the leading walkthrough image when eager is %s', eager => {
  const html = renderToStaticMarkup(
    <UiWalkthrough
      scenarioId="example"
      eager={eager}
      walkthrough={{type: 'Screenshots', screenshots: ['/media/first.png', '/media/second.png']}}
    />,
  )
  const images = html.match(/<img[^>]+>/g)
  expect(images).toHaveLength(2)
  expect(images?.[0]).toContain(`loading="${eager ? 'eager' : 'lazy'}"`)
  expect(images?.[1]).toContain('loading="lazy"')
  expect(html).not.toContain('data:image')
})

test('does not preload the bytes of an external walkthrough video', () => {
  const html = renderToStaticMarkup(
    <UiWalkthrough scenarioId="example" eager walkthrough={{type: 'Video', video: '/media/video.webm'}} />,
  )
  expect(html).toContain('preload="none"')
  expect(html).toContain('src="/media/video.webm"')
})
