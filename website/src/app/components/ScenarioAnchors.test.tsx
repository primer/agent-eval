import {renderToStaticMarkup} from 'react-dom/server'
import type {Route} from 'next'
import {expect, test, vi} from 'vitest'
import {getExperimentResults} from '../../experiment-results'
import {createExperimentRunDetails} from '../../run-details'
import {createResult, createRun} from '../../test/experiment'
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

test('links shared experiment scenarios to distinct capability targets and shows separate runner rows', async () => {
  const results = [
    createResult({id: 'first', capabilityId: 'a'}),
    createResult({id: 'sdk', capabilityId: 'a', runner: 'copilot-sdk'}),
    createResult({id: 'second', capabilityId: 'b'}),
  ]
  const output = createRun(results).output
  output.capabilities = new Map([
    ['a', {id: 'a', name: 'Components', scenarioIds: ['scenario-a']}],
    ['b', {id: 'b', name: 'Layout', scenarioIds: ['scenario-a']}],
  ])
  const run = await createExperimentRunDetails('2026-09-10', output)
  const summary = getExperimentResults({...createRun(results), output})
  const overview = renderToStaticMarkup(<LatestExperimentResults id="noop" results={summary} />)
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
  const links = [...overview.matchAll(/href="([^"]+#capability-scenario-[^"]+)"/g)]
  const targets = [...details.matchAll(/<article[^>]+id="([^"]+)"/g)].map(match => {
    return match[1]
  })

  expect(overview).toContain('Capability results')
  expect(overview).toContain('copilot-sdk')
  expect(overview).toContain('Runner')
  expect(links).toHaveLength(2)
  expect(targets).toHaveLength(2)
  expect(new Set(targets).size).toBe(2)
  for (const [, href] of links) {
    expect(targets).toContain(new URL(href, 'https://example.test').hash.slice(1))
  }
  expect(details).toContain('All capabilities')
  expect(details).toContain('Components / scenario-a')
  expect(details).toContain('Layout / scenario-a')
})
