import {renderToStaticMarkup} from 'react-dom/server'
import type {Route} from 'next'
import {expect, test, vi} from 'vitest'
import {getExperimentResults} from '../../experiment-results'
import {createExperimentRunDetails} from '../../run-details'
import {createResult, createRun} from '../../test/experiment'
import {getCapabilityScenarioAnchor} from '../../scenario-anchor'
import {LatestExperimentResults} from './ExperimentResults'
import {RunDetailsPage} from './RunDetailsPage'

vi.mock('server-only', () => {
  return {}
})

test.each(['001-button', 'space / literal%20 # caf\u00e9'])(
  'links to the rendered scenario target for %s',
  async scenarioId => {
    const result = createResult({scenarioId})
    const run = await createExperimentRunDetails('2026-09-10', createRun([result]).output)
    const overview = renderToStaticMarkup(
      <LatestExperimentResults id="noop" results={getExperimentResults(createRun([result]))} />,
    )

    const details = renderToStaticMarkup(
      <RunDetailsPage
        resource={{
          id: 'noop',
          name: 'Example experiment',
          collectionLabel: 'Experiments',
          collectionHref: '/experiments',
          href: '/experiments/noop' as Route,
        }}
        run={run}
      />,
    )
    const href = /href="([^"]+#scenario-[^"]+)"/.exec(overview)?.[1]
    const target = /<article[^>]+id="([^"]+)"/.exec(details)?.[1]
    expect(href).toBeDefined()
    expect(target).toBeDefined()
    expect(decodeURIComponent(new URL(href!, 'https://example.test').hash.slice(1))).toBe(target)
    expect(target).not.toMatch(/\s/)
  },
)

test('uses stable, distinct artifact targets for a scenario shared by capabilities', async () => {
  const scenarioId = 'scenario-a'
  const saved = createRun([
    createResult({scenarioId, capabilityId: 'a'}),
    createResult({id: 'second', scenarioId, capabilityId: 'b'}),
  ])
  saved.output.benchmark = {
    id: 'suite',
    name: 'Saved suite',
    capabilities: {
      a: {id: 'a', name: 'First capability', scenarioIds: [scenarioId]},
      b: {id: 'b', name: 'Second capability', scenarioIds: [scenarioId]},
    },
  }
  const run = await createExperimentRunDetails(saved.name, saved.output)
  const html = renderToStaticMarkup(
    <RunDetailsPage
      resource={{
        id: 'example',
        name: 'Example',
        collectionLabel: 'Experiments',
        collectionHref: '/experiments',
        href: '/experiments/example' as Route,
      }}
      run={run}
    />,
  )

  const first = getCapabilityScenarioAnchor('a', scenarioId)
  const second = getCapabilityScenarioAnchor('b', scenarioId)
  expect(first.id).not.toBe(second.id)
  expect(html).toContain(`id="${first.id}"`)
  expect(html).toContain(`id="${second.id}"`)
  expect(
    run.results.map(result => {
      return result.capability?.name
    }),
  ).toEqual(['First capability', 'Second capability'])
})
