import {renderToStaticMarkup} from 'react-dom/server'
import {expect, test} from 'vitest'
import type {JudgeDetails} from '../../run-details'
import {JudgeResults} from './JudgeResults'

const config: JudgeDetails['config'] = {
  name: 'empty-state-copy',
  description: 'Evaluate the empty state.',
  judge: {instructions: 'Inspect the user-facing copy.'},
  scores: [
    {value: 0, description: 'Clear copy.'},
    {value: 10, description: 'Needs work.'},
  ],
}

test('renders the raw score, matching anchor, rationale, and escaped file-backed findings', () => {
  const html = renderToStaticMarkup(
    <JudgeResults
      judges={[
        {
          config,
          result: {
            type: 'result',
            score: 0,
            rationale: 'The copy is friendly and actionable.',
            findings: [
              {
                filepath: 'src/App.tsx',
                snippet: '<h1>No projects yet</h1>\n<p>Create your first project.</p>',
                explanation: 'The heading and sentence explain the next step.',
              },
            ],
          },
        },
      ]}
    />,
  )

  expect(html).toContain('empty-state-copy')
  expect(html).toContain('Evaluate the empty state.')
  expect(html).toContain('Score: 0')
  expect(html).toContain('Clear copy.')
  expect(html).toContain('The copy is friendly and actionable.')
  expect(html).toContain('src/App.tsx')
  expect(html).toContain('&lt;h1&gt;No projects yet&lt;/h1&gt;\n&lt;p&gt;Create your first project.&lt;/p&gt;')
  expect(html).toContain('The heading and sentence explain the next step.')
  expect(html).toContain('Scoring criteria')
  expect(html).toContain('Inspect the user-facing copy.')
  expect(html).toContain('Score: 10')
  expect(html).toContain('Needs work.')
  expect(html).not.toContain('text-success')
  expect(html).not.toContain('text-danger')
})

test('renders errors and unknown results independently for multiple judges', () => {
  const html = renderToStaticMarkup(
    <JudgeResults
      judges={[
        {config, result: {type: 'error', message: 'Invalid report: <not JSON>'}},
        {config: {...config, name: 'another-judge'}, result: {type: 'unknown'}},
      ]}
    />,
  )

  expect(html).toContain('Judge error')
  expect(html).toContain('Invalid report: &lt;not JSON&gt;')
  expect(html).toContain('another-judge')
  expect(html).toContain('No result was recorded for this judge.')
  expect(html).not.toContain('Rationale')
})

test('renders an empty state when no judges were recorded', () => {
  const html = renderToStaticMarkup(<JudgeResults judges={[]} />)
  expect(html).toContain('No judge results were recorded.')
})

test('renders a scored result with no file-backed findings or optional configuration', () => {
  const html = renderToStaticMarkup(
    <JudgeResults
      judges={[
        {
          config: {...config, description: undefined, judge: {}},
          result: {type: 'result', score: 10, rationale: 'No files were available.', findings: []},
        },
      ]}
    />,
  )
  expect(html).toContain('Score: 10')
  expect(html).toContain('No files were available.')
  expect(html).toContain('No file-backed findings were recorded.')
})
