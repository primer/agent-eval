import {renderToStaticMarkup} from 'react-dom/server'
import type {Route} from 'next'
import {expect, test} from 'vitest'
import {getExperimentResults} from '../../experiment-results'
import type {RunDetails} from '../../run-details'
import {createResult, createRun} from '../../test/experiment'
import {LatestExperimentResults} from './ExperimentResults'
import {RunDetailsPage} from './RunDetailsPage'

test.each(['001-button', 'space / literal%20 # caf\u00e9'])(
  'links to the rendered scenario target for %s',
  scenarioId => {
    const result = createResult({scenarioId})
    const run: RunDetails = {
      date: '2026-09-10',
      results: [
        {
          id: result.id,
          scenarioId,
          treatment: 'Control',
          model: result.model,
          reasoningEffort: result.reasoningEffort,
          testsPassed: 0,
          totalTests: 0,
          turns: 0,
          outputTokens: 0,
          premiumRequests: 0,
          totalApiDurationMs: 0,
          sessionDurationMs: 0,
          tests: [],
          transcript: [],
          walkthrough: {type: 'Unavailable'},
          judges: [],
        },
      ],
    }
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
