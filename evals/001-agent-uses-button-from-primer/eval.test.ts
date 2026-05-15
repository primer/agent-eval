import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const pagePath = path.resolve(import.meta.dirname, 'src', 'app', 'page.tsx')
const page = await fs.readFile(pagePath, 'utf8')

test('src/app/page.tsx imports Primer Button', () => {
  expect(page).toMatch(/import\s+{[^}]*\bButton\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
})

test('src/app/page.tsx uses Primer Button', () => {
  expect(page).toMatch(/<Button[^>]*>[\s\S]*?<\/Button>/)
})

test('src/app/page.tsx uses primary variant', () => {
  expect(page).toMatch(/<Button[^>]*variant=["']primary["'][^>]*>[\s\S]*?<\/Button>/)
})

test('src/app/page.tsx button has text submit', () => {
  expect(page).toMatch(/<Button[^>]*>[\s\S]*?Submit[\s\S]*?<\/Button>/)
})
