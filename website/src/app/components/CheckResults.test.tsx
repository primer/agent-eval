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
