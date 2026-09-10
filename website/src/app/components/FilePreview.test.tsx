import {renderToStaticMarkup} from 'react-dom/server'
import {expect, test, vi} from 'vitest'
import type {WorkspaceFile} from '../../workspace-files'
import {FilePreview, getFileLanguage} from './FilePreview'

vi.mock('server-only', () => {
  return {}
})

function file(filepath: string, content: string): WorkspaceFile {
  return {
    type: 'file',
    path: filepath,
    name: filepath.split('/').at(-1) ?? filepath,
    size: Buffer.byteLength(content),
    preview: {type: 'text', content},
  }
}

test.each([
  ['src/App.tsx', 'tsx'],
  ['src/index.ts', 'typescript'],
  ['src/types.d.ts', 'typescript'],
  ['src/index.mts', 'typescript'],
  ['src/App.jsx', 'jsx'],
  ['next.config.mjs', 'javascript'],
  ['index.cjs', 'javascript'],
  ['package.json', 'json'],
  ['styles.CSS', 'css'],
  ['README.md', 'markdown'],
  ['workflow.yml', 'yaml'],
  ['script.py', 'python'],
  ['script.sh', 'shellscript'],
  ['Dockerfile', 'docker'],
  ['Dockerfile.dev', 'docker'],
  ['Makefile', 'make'],
  ['.env.local', 'dotenv'],
  ['LICENSE', 'text'],
  ['file.unknown', 'text'],
])('detects the language for %s', (filepath, language) => {
  expect(getFileLanguage(filepath)).toBe(language)
})

test.each([
  ['src/App.tsx', 'export default function App() {\n  return <button>Hello</button>\n}\n'],
  ['package.json', '{\n  "name": "generated-app"\n}\n'],
  ['styles.css', 'button {\n  color: red;\n}\n'],
])('renders %s as highlighted server markup with both themes', async (filepath, content) => {
  const html = renderToStaticMarkup(await FilePreview({file: file(filepath, content)}))
  expect(html).toContain('--shiki-light:')
  expect(html).toContain('--shiki-dark:')
  expect(html).toContain(`aria-label="${filepath}"`)
  expect(html).toContain('tabindex="0"')
  expect(html.replace(/<[^>]*>/g, '')).toBe(renderToStaticMarkup(<>{content}</>))
})

test.each([
  '\n\n\tconst greeting = "hello"\n\n',
  '\r\n\tconst greeting = "hello"\r\n\r\n',
  '\nconst first = 1\r\nconst second = 2\n',
  'const greeting = "hello"',
  'const greeting = "こんにちは 👋"\n',
])('preserves source text, whitespace, and line endings: %j', async content => {
  const html = renderToStaticMarkup(await FilePreview({file: file('index.ts', content)}))
  expect(html.replace(/<[^>]*>/g, '')).toBe(renderToStaticMarkup(<>{content}</>))
})

test('escapes file contents rather than rendering generated HTML', async () => {
  const content = '<script>alert("generated")</script><img src=x onerror=alert(1)>'
  const html = renderToStaticMarkup(await FilePreview({file: file('index.html', content)}))
  expect(html).not.toContain('<script>')
  expect(html).not.toContain('<img ')
  expect(html.replace(/<[^>]*>/g, '')).toBe(renderToStaticMarkup(<>{content}</>))
})

test('renders unknown file types as escaped plain text', async () => {
  const content = '<script>alert("generated")</script>\nplain text\n'
  const html = renderToStaticMarkup(await FilePreview({file: file('notes.unknown', content)}))
  expect(html).not.toContain('<span')
  expect(html).not.toContain('--shiki-')
  expect(html).toContain('&lt;script&gt;')
  expect(html.replace(/<[^>]*>/g, '')).toBe(renderToStaticMarkup(<>{content}</>))
})

test('preserves empty and unavailable preview messages', async () => {
  const empty = renderToStaticMarkup(await FilePreview({file: file('empty.ts', '')}))
  expect(empty).toContain('This file is empty.')
  const unavailable = renderToStaticMarkup(
    await FilePreview({
      file: {
        ...file('binary.png', ''),
        preview: {type: 'unavailable', reason: 'Binary files cannot be previewed.'},
      },
    }),
  )
  expect(unavailable).toContain('Binary files cannot be previewed.')
  expect(unavailable).not.toContain('<pre')
})
