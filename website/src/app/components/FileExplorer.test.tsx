import {renderToStaticMarkup} from 'react-dom/server'
import {expect, test} from 'vitest'
import {FileExplorer} from './FileExplorer'

test('encodes whitespace in tree IDs without changing file names or introducing collisions', () => {
  const html = renderToStaticMarkup(
    <FileExplorer
      workspace={{
        type: 'available',
        truncated: false,
        entries: [
          {type: 'directory', name: 'my folder', path: 'my folder', children: []},
          ...['my file.ts', 'my%20file.ts', 'tab\tname.ts', 'line\nname.ts'].map(name => {
            return {
              type: 'file' as const,
              name,
              path: name,
              size: 0,
              preview: {type: 'text' as const, content: ''},
            }
          }),
        ],
      }}
    />,
  )
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => {
    return match[1]
  })
  expect(ids.length).toBeGreaterThanOrEqual(5)
  expect(new Set(ids).size).toBe(ids.length)
  for (const id of ids) {
    expect(id).not.toMatch(/\s/)
  }
  for (const name of ['my folder', 'my file.ts', 'my%20file.ts', 'tab\tname.ts', 'line\nname.ts']) {
    expect(
      ids.some(id => {
        return id.endsWith(`-${encodeURIComponent(name)}`)
      }),
    ).toBe(true)
    expect(html).toContain(name)
  }
})
