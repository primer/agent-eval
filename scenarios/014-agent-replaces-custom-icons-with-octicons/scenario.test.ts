import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const app = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'App.tsx'), 'utf8')

test('imports icons directly from Primer Octicons', () => {
  expect(app).toMatch(/from\s+['"]@primer\/octicons-react['"]/)
})

test.each(['SearchIcon', 'DownloadIcon', 'TrashIcon'])('uses %s', icon => {
  expect(app).toMatch(new RegExp(`(?:<${icon}(?:\\s[^>]*)?\\/?>|icon=\\{${icon}\\})`))
})

test('removes the hand-drawn SVG elements', () => {
  expect(app).not.toMatch(/<svg\b/)
})

test('does not use the deprecated Octicon wrapper', () => {
  expect(app).not.toMatch(/<Octicon\b/)
})
