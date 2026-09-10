import {renderToStaticMarkup} from 'react-dom/server'
import {afterEach, expect, test, vi} from 'vitest'
import type {RunDetails} from '../../run-details'
import {RunDetailsPage} from './RunDetailsPage'
import {RunDetailsView} from './RunDetailsView'

vi.mock('server-only', () => {
  return {}
})
vi.mock('./RunDetailsView', () => {
  return {
    RunDetailsView: vi.fn(() => {
      return null
    }),
  }
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

test.each(['benchmarks', 'experiments'] as const)(
  'passes lightweight %s preview references instead of file contents or tokens',
  collection => {
    vi.stubEnv('PAGES_BASE_PATH', '/agent-eval')
    const content = 'const generatedSource = "not part of the run payload"\n'.repeat(1000)
    const run: RunDetails = {
      date: '2026-09-03',
      results: [
        {
          id: 'trial 1',
          scenarioId: 'scenario',
          treatment: 'Control',
          model: 'test-model',
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
          workspace: {
            type: 'available',
            truncated: false,
            entries: [
              {
                type: 'directory',
                name: 'src',
                path: 'src',
                children: [
                  {
                    type: 'file',
                    name: 'index.ts',
                    path: 'src/index.ts',
                    size: content.length,
                    preview: {type: 'text', content},
                  },
                ],
              },
            ],
          },
        },
      ],
    }
    renderToStaticMarkup(
      <RunDetailsPage
        resource={{
          id: 'test-id',
          name: 'Test',
          collectionLabel: collection,
          collectionHref: `/${collection}`,
          href: `/${collection}`,
        }}
        run={run}
      />,
    )
    const props = vi.mocked(RunDetailsView).mock.calls[0][0]
    const payload = JSON.stringify(props.run)
    expect(payload).not.toContain('generatedSource')
    expect(payload).not.toContain('--shiki-')
    expect(payload).toContain(`/agent-eval/file-previews/${collection}/test-id/2026-09-03/trial%201/`)
    expect(payload).toContain('/preview.json')
    expect(Buffer.byteLength(payload)).toBeLessThan(2000)
  },
)
