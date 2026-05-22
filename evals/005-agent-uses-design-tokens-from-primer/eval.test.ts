import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const pagePath = path.resolve(import.meta.dirname, 'src', 'app', 'page.tsx')
const page = await fs.readFile(pagePath, 'utf8')

test('src/app/page.tsx imports Primer layout and text components', () => {
  expect(page).toMatch(/import\s+{[^}]*\bButton\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
  expect(page).toMatch(/import\s+{[^}]*\bHeading\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
  expect(page).toMatch(/import\s+{[^}]*\bStack\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
  expect(page).toMatch(/import\s+{[^}]*\bText\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
})

test('src/app/page.tsx uses Primer components for the callout', () => {
  expect(page).toMatch(/<Stack(?:\s[^>]*)?>[\s\S]*?<\/Stack>/)
  expect(page).toMatch(/<Heading(?:\s[^>]*)?>[\s\S]*?<\/Heading>/)
  expect(page).toMatch(/<Text(?:\s[^>]*)?>[\s\S]*?<\/Text>/)
  expect(page).toMatch(/<Button(?:\s[^>]*)?>[\s\S]*?<\/Button>/)
})

test('src/app/page.tsx uses Primer design tokens for success styling', () => {
  expect(page).toMatch(/bgColor-success-muted/)
  expect(page).toMatch(/borderColor-success-muted/)
  expect(page).toMatch(/fgColor-muted/)
})

test('src/app/page.tsx uses Primer design tokens for radius and spacing', () => {
  expect(page).toMatch(/borderRadius-medium/)
  expect(page).toMatch(/base-size-16/)
})

test('src/app/page.tsx avoids hard-coded inline color values', () => {
  expect(page).not.toMatch(/(?:color|background(?:Color)?|border(?:Color)?):\s*['"](?:#[0-9a-fA-F]{3,8}|rgba?\()/)
})
