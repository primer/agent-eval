import {renderToStaticMarkup} from 'react-dom/server'
import {expect, test, vi} from 'vitest'
import {getFileLanguage, highlightFile} from '../../file-highlighting'
import {isFilePreviewData} from '../../file-preview'
import type {WorkspaceFile} from '../../workspace-files'
import {FilePreview, FilePreviewContent} from './FilePreview'

vi.mock('server-only', () => {
  return {}
})
vi.mock('@primer/react', () => {
  return {Button: 'button'}
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

async function renderFile(workspaceFile: WorkspaceFile) {
  const preview = await highlightFile(workspaceFile)
  expect(isFilePreviewData(JSON.parse(JSON.stringify(preview)))).toBe(true)
  return renderToStaticMarkup(<FilePreviewContent filepath={workspaceFile.path} preview={preview} />)
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
])('renders server-highlighted %s tokens with both themes', async (filepath, content) => {
  const html = await renderFile(file(filepath, content))
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
  const html = await renderFile(file('index.ts', content))
  expect(html.replace(/<[^>]*>/g, '')).toBe(renderToStaticMarkup(<>{content}</>))
})

test('escapes file contents rather than rendering generated HTML', async () => {
  const content = '<script>alert("generated")</script><img src=x onerror=alert(1)>'
  const html = await renderFile(file('index.html', content))
  expect(html).not.toContain('<script>')
  expect(html).not.toContain('<img ')
  expect(html.replace(/<[^>]*>/g, '')).toBe(renderToStaticMarkup(<>{content}</>))
})

test('renders unknown file types as escaped plain text', async () => {
  const content = '<script>alert("generated")</script>\nplain text\n'
  const html = await renderFile(file('notes.unknown', content))
  expect(html).not.toContain('<span')
  expect(html).not.toContain('--shiki-')
  expect(html).toContain('&lt;script&gt;')
  expect(html.replace(/<[^>]*>/g, '')).toBe(renderToStaticMarkup(<>{content}</>))
})

test('preserves empty and unavailable preview messages', async () => {
  const empty = await renderFile(file('empty.ts', ''))
  expect(empty).toContain('This file is empty.')
  const unavailable = await renderFile({
    ...file('binary.png', ''),
    preview: {type: 'unavailable', reason: 'Binary files cannot be previewed.'},
  })
  expect(unavailable).toContain('Binary files cannot be previewed.')
  expect(unavailable).not.toContain('<pre')
})

test('renders only a loading state before fetching a selected remote preview', () => {
  const html = renderToStaticMarkup(
    <FilePreview
      file={{...file('index.ts', ''), preview: {type: 'remote', url: '/file-previews/example/preview.json'}}}
    />,
  )
  expect(html).toContain('Loading file preview...')
  expect(html).not.toContain('<pre')
})

test.each([
  null,
  {},
  {type: 'text', content: 1},
  {type: 'unavailable'},
  {type: 'highlighted', content: '', tokens: null},
  {type: 'highlighted', content: '', tokens: [{content: 'x', offset: -1, style: {}}]},
  {type: 'highlighted', content: '', tokens: [{content: 'x', offset: 0, style: {'--shiki-light': 1}}]},
])('rejects malformed preview responses: %j', value => {
  expect(isFilePreviewData(value)).toBe(false)
})
