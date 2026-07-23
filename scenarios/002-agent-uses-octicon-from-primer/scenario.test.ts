import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const pagePath = path.resolve(import.meta.dirname, 'src', 'app', 'page.tsx')
const page = await fs.readFile(pagePath, 'utf8')

test('src/app/page.tsx imports Primer SearchIcon', () => {
  expect(page).toMatch(/import\s+{[^}]*\bSearchIcon\b[^}]*}\s+from\s+['"]@primer\/octicons-react['"]/)
})

test('src/app/page.tsx uses Primer SearchIcon', () => {
  expect(page).toMatch(/<SearchIcon(?:\s[^>]*)?\/>|<SearchIcon(?:\s[^>]*)?>[\s\S]*?<\/SearchIcon>/)
})
