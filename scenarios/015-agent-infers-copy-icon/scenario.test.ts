import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const app = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'App.tsx'), 'utf8')

test('imports and renders CopyIcon', () => {
  expect(app).toMatch(/import\s+{[^}]*\bCopyIcon\b[^}]*}\s+from\s+['"]@primer\/octicons-react['"]/)
  expect(app).toMatch(/<CopyIcon(?:\s[^>]*)?\/?>|icon=\{CopyIcon\}/)
})

test('uses the current IconButton component', () => {
  expect(app).toMatch(/import\s+{[^}]*\bIconButton\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
  expect(app).toMatch(/<IconButton\b/)
})

test('gives the compact control an accessible label', () => {
  expect(app).toMatch(/<IconButton[^>]*aria-label=["'][^"']*copy[^"']*["'][^>]*>/i)
})

test('copies the commit SHA to the clipboard', () => {
  expect(app).toMatch(/navigator\.clipboard\.writeText\(/)
})
