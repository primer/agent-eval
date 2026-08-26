import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const app = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'App.tsx'), 'utf8')

test('composes current menu components for the filters', () => {
  expect(app).toMatch(/import\s+{[^}]*\bActionMenu\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
  expect(app).toMatch(/import\s+{[^}]*\bActionList\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
  expect(app.match(/<ActionMenu(?:\s[^>]*)?>/g)?.length).toBeGreaterThanOrEqual(3)
})

test.each(['author', 'label', 'status'])('provides a visible %s filter', filter => {
  expect(app).toMatch(new RegExp(`>[^<]*${filter}[^<]*<`, 'i'))
})

test('announces the updated result count', () => {
  expect(app).toMatch(/role=["']status["']/)
})

test('does not use deprecated filtering components', () => {
  expect(app).not.toMatch(/\bFilteredSearch\b|\bSelectPanel\b/)
})
