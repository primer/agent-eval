import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const app = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'App.tsx'), 'utf8')

test('imports Pagination from the design system', () => {
  expect(app).toMatch(/import\s+{[^}]*\bPagination\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
})

test('renders Pagination', () => {
  expect(app).toMatch(/<Pagination(?:\s[^>]*)?>/)
})

test('configures the current page and page count', () => {
  expect(app).toMatch(/<Pagination[^>]*\bcurrentPage=\{?[^}\s]+}?/)
  expect(app).toMatch(/<Pagination[^>]*\bpageCount=\{?[^}\s]+}?/)
})
