import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const layoutPath = path.resolve(import.meta.dirname, 'src', 'app', 'layout.tsx')
const layout = await fs.readFile(layoutPath, 'utf8')

test('src/app/layout.tsx imports Primer primitives', () => {
  expect(layout).toMatch(/import\s+['"]@primer\/primitives\/dist\/css\/primitives\.css['"]/)
})

test('src/app/layout.tsx imports Primer light theme primitives', () => {
  expect(layout).toMatch(/import\s+['"]@primer\/primitives\/dist\/css\/functional\/themes\/light\.css['"]/)
})

test('src/app/layout.tsx imports Primer dark theme primitives', () => {
  expect(layout).toMatch(/import\s+['"]@primer\/primitives\/dist\/css\/functional\/themes\/dark\.css['"]/)
})

test('src/app/layout.tsx sets data-color-mode', () => {
  expect(layout).toMatch(/<html[^>]*\bdata-color-mode=/)
})

test('src/app/layout.tsx sets data-light-mode', () => {
  expect(layout).toMatch(/<html[^>]*\bdata-light-mode=/)
})

test('src/app/layout.tsx sets data-dark-mode', () => {
  expect(layout).toMatch(/<html[^>]*\bdata-dark-mode=/)
})
