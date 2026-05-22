import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const pagePath = path.resolve(import.meta.dirname, 'src', 'app', 'page.tsx')
const page = await fs.readFile(pagePath, 'utf8')

test('src/app/page.tsx imports Primer status list components', () => {
  expect(page).toMatch(/import\s+{[^}]*\bLabel\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
  expect(page).toMatch(/import\s+{[^}]*\bStack\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
  expect(page).toMatch(/import\s+{[^}]*\bText\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
})

test('src/app/page.tsx imports the expected Primer Octicons', () => {
  expect(page).toMatch(/import\s+{[^}]*\bAlertIcon\b[^}]*}\s+from\s+['"]@primer\/octicons-react['"]/)
  expect(page).toMatch(/import\s+{[^}]*\bCheckCircleFillIcon\b[^}]*}\s+from\s+['"]@primer\/octicons-react['"]/)
  expect(page).toMatch(/import\s+{[^}]*\bLinkExternalIcon\b[^}]*}\s+from\s+['"]@primer\/octicons-react['"]/)
  expect(page).toMatch(/import\s+{[^}]*\bSearchIcon\b[^}]*}\s+from\s+['"]@primer\/octicons-react['"]/)
})

test('src/app/page.tsx renders each expected Primer Octicon', () => {
  expect(page).toMatch(/<AlertIcon(?:\s[^>]*)?\/>|<AlertIcon(?:\s[^>]*)?>[\s\S]*?<\/AlertIcon>/)
  expect(page).toMatch(
    /<CheckCircleFillIcon(?:\s[^>]*)?\/>|<CheckCircleFillIcon(?:\s[^>]*)?>[\s\S]*?<\/CheckCircleFillIcon>/,
  )
  expect(page).toMatch(/<LinkExternalIcon(?:\s[^>]*)?\/>|<LinkExternalIcon(?:\s[^>]*)?>[\s\S]*?<\/LinkExternalIcon>/)
  expect(page).toMatch(/<SearchIcon(?:\s[^>]*)?\/>|<SearchIcon(?:\s[^>]*)?>[\s\S]*?<\/SearchIcon>/)
})

test('src/app/page.tsx uses Primer components for the status list structure', () => {
  expect(page).toMatch(/<Stack(?:\s[^>]*)?>[\s\S]*?<\/Stack>/)
  expect(page).toMatch(/<Label(?:\s[^>]*)?>[\s\S]*?<\/Label>/)
  expect(page).toMatch(/<Text(?:\s[^>]*)?>[\s\S]*?<\/Text>/)
})

test('src/app/page.tsx includes content for all four status rows', () => {
  expect(page).toMatch(/\b(success|successful|succeeded)\b/i)
  expect(page).toMatch(/\b(warning|attention)\b/i)
  expect(page).toMatch(/\b(logs?|search)\b/i)
  expect(page).toMatch(/\b(docs?|documentation|external)\b/i)
})
