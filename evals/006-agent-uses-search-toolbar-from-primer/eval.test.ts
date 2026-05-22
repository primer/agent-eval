import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const pagePath = path.resolve(import.meta.dirname, 'src', 'app', 'page.tsx')
const page = await fs.readFile(pagePath, 'utf8')

test('src/app/page.tsx imports Primer toolbar components', () => {
  expect(page).toMatch(/import\s+{[^}]*\bActionList\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
  expect(page).toMatch(/import\s+{[^}]*\bActionMenu\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
  expect(page).toMatch(/import\s+{[^}]*\bButton\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
  expect(page).toMatch(/import\s+{[^}]*\bTextInput\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
})

test('src/app/page.tsx imports Primer SearchIcon', () => {
  expect(page).toMatch(/import\s+{[^}]*\bSearchIcon\b[^}]*}\s+from\s+['"]@primer\/octicons-react['"]/)
})

test('src/app/page.tsx uses TextInput as an accessible search field', () => {
  expect(page).toMatch(/<TextInput[^>]*(?:aria-label|placeholder)=["'][^"']*search[^"']*["'][^>]*\/?>/i)
  expect(page).toMatch(/leadingVisual=\{(?:\s*SearchIcon\s*|[\s\S]*?<SearchIcon(?:\s[^>]*)?\/>[\s\S]*?)\}/)
})

test('src/app/page.tsx uses separate ActionMenus for filter and sort controls', () => {
  expect(page.match(/<ActionMenu(?:\s[^>]*)?>/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  expect(page).toMatch(/<ActionMenu\.Button(?:\s[^>]*)?>[\s\S]*?Filter[\s\S]*?<\/ActionMenu\.Button>/i)
  expect(page).toMatch(/<ActionMenu\.Button(?:\s[^>]*)?>[\s\S]*?Sort[\s\S]*?<\/ActionMenu\.Button>/i)
})

test('src/app/page.tsx uses Primer ActionList items in menu overlays', () => {
  expect(page).toMatch(/<ActionMenu\.Overlay(?:\s[^>]*)?>[\s\S]*?<\/ActionMenu\.Overlay>/)
  expect(page).toMatch(
    /<ActionList(?:\s[^>]*)?>[\s\S]*?<ActionList\.Item(?:\s[^>]*)?>[\s\S]*?<\/ActionList\.Item>[\s\S]*?<\/ActionList>/,
  )
})

test('src/app/page.tsx renders result count and clear action', () => {
  expect(page).toMatch(/\bresults?\b/i)
  expect(page).toMatch(/<Button(?:\s[^>]*)?>[\s\S]*?Clear[\s\S]*?<\/Button>/i)
})
