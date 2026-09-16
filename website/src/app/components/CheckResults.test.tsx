import {renderToStaticMarkup} from 'react-dom/server'
import {expect, test} from 'vitest'
import {checks} from '../../test-fixtures'
import {CheckResults} from './CheckResults'

test('renders outcomes, measurements, group IDs, units, directions, skips, and errors', () => {
  const html = renderToStaticMarkup(<CheckResults checks={checks} />)
  for (const text of [
    'tests',
    'empty state renders',
    'passed',
    'keyboard access',
    'failed',
    'optional browser',
    'text-muted">skipped',
    'Check error:',
    'Browser unavailable',
    'performance / render',
    'lower-is-better',
    '10 ms',
    '20 ms',
    'Timeout',
  ]) {
    expect(html).toContain(text)
  }
})

test('renders empty checks and empty value groups without inventing a score', () => {
  expect(renderToStaticMarkup(<CheckResults checks={[]} />)).toContain('No check results were recorded.')
  expect(
    renderToStaticMarkup(
      <CheckResults checks={[{check: {name: 'empty', files: []}, result: {type: 'outcomes', outcomes: []}}]} />,
    ),
  ).toContain('No values were recorded for this check.')
})

test('uses distinct decorative pass, fail, and skip icons only for outcomes', () => {
  const html = renderToStaticMarkup(<CheckResults checks={checks} />)
  expect(html).toMatch(/text-success shrink-0"><svg[^>]*class="octicon octicon-check-circle-fill"[^>]*>/)
  expect(html).toMatch(/text-danger shrink-0"><svg[^>]*class="octicon octicon-x-circle-fill"[^>]*>/)
  expect(html).toMatch(/text-muted shrink-0"><svg[^>]*class="octicon octicon-skip-fill"[^>]*>/)
  expect(html.match(/<svg /g)).toHaveLength(3)
  expect(html.match(/aria-hidden="true"/g)).toHaveLength(3)
})

test('escapes arbitrary check errors and supplies labels for outcomes without IDs', () => {
  const html = renderToStaticMarkup(
    <CheckResults
      checks={[
        {
          check: {name: '<script>', files: []},
          result: {
            type: 'outcomes',
            outcomes: [
              {type: 'outcome', status: 'skipped'},
              {type: 'error', message: '<script>alert(1)</script>'},
            ],
          },
        },
      ]}
    />,
  )
  expect(html).toContain('Outcome 1')
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  expect(html).not.toContain('<script>')
})
