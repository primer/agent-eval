import {renderToStaticMarkup} from 'react-dom/server'
import {expect, test} from 'vitest'
import {Transcript} from './Transcript'

test.each(['Assistant', 'Reasoning', 'Summary'])('renders GFM in %s messages', label => {
  const content = [
    '**Summary** with *emphasis* and ~~removed text~~.',
    '',
    '- [x] Complete',
    '- [ ] Pending',
    '',
    '| Check | Result |',
    '| --- | --- |',
    '| Build | Passed |',
    '',
    'https://example.com',
    '',
    '```ts',
    'const element = "<main>"',
    '```',
    '',
    'A note[^1].',
    '',
    '[^1]: Supporting details.',
  ].join('\n')

  const html = renderToStaticMarkup(<Transcript entries={[{id: 'message', label, content}]} />)

  expect(html).toContain('<strong>Summary</strong>')
  expect(html).toContain('<em>emphasis</em>')
  expect(html).toContain('<del>removed text</del>')
  expect(html).toContain('type="checkbox" disabled="" checked=""')
  expect(html).toContain('type="checkbox" disabled=""')
  expect(html).toContain('<table>')
  expect(html).toContain('<th>Check</th>')
  expect(html).toContain('<td>Passed</td>')
  expect(html).toContain('<a href="https://example.com">https://example.com</a>')
  expect(html).toContain('<pre><code class="language-ts">const element = &quot;&lt;main&gt;&quot;\n</code></pre>')
  expect(html).toContain('data-footnotes')
  expect(html).toContain('Supporting details.')
})

test.each(['Assistant', 'Reasoning', 'Summary'])(
  'ignores embedded HTML and blocks unsafe links in %s messages',
  label => {
    const content = [
      '**Safe content**',
      '',
      '<script>alert("unsafe")</script>',
      '',
      '<img src="https://example.com/track" onerror="alert(1)">',
      '',
      '[Unsafe link](javascript:alert%281%29)',
      '',
      '[Safe link](https://example.com)',
      '',
      '`<script>literal code</script>`',
    ].join('\n')

    const html = renderToStaticMarkup(<Transcript entries={[{id: 'message', label, content}]} />)

    expect(html).toContain('<strong>Safe content</strong>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('<a href="https://example.com">Safe link</a>')
    expect(html).toContain('<code>&lt;script&gt;literal code&lt;/script&gt;</code>')
  },
)

test.each(['User', 'Tool call: bash', 'Tool result: bash'])('keeps %s content literal', label => {
  const content = '**Not bold**\n\n<script>not executed</script>\n\n- [x] Not a checkbox'

  const html = renderToStaticMarkup(<Transcript entries={[{id: 'message', label, content}]} />)

  expect(html).toContain('**Not bold**')
  expect(html).toContain('&lt;script&gt;not executed&lt;/script&gt;')
  expect(html).toContain('- [x] Not a checkbox')
  expect(html).not.toContain('<strong>')
  expect(html).not.toContain('<input')
  expect(html).not.toContain('<script')
})

test('keeps footnote targets and accessible labels unique across messages', () => {
  const html = renderToStaticMarkup(
    <Transcript
      entries={['Assistant', 'Reasoning'].map(label => {
        return {id: label, label, content: `A note[^1].\n\n[^1]: ${label} footnote.`}
      })}
    />,
  )
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => {
    return match[1]
  })
  const targets = [...html.matchAll(/href="#([^"]+)"/g)].map(match => {
    return decodeURIComponent(match[1])
  })
  const labels = [...html.matchAll(/aria-describedby="([^"]+)"/g)].map(match => {
    return match[1]
  })

  expect(new Set(ids).size).toBe(ids.length)
  expect(targets).toHaveLength(4)
  expect(new Set(labels).size).toBe(2)
  for (const target of [...targets, ...labels]) {
    expect(ids).toContain(target)
  }
})
