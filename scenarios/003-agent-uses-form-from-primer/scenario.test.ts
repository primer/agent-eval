import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const pagePath = path.resolve(import.meta.dirname, 'src', 'app', 'page.tsx')
const page = await fs.readFile(pagePath, 'utf8')

test('src/app/page.tsx imports Primer FormControl', () => {
  expect(page).toMatch(/import\s+{[^}]*\bFormControl\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
})

test('src/app/page.tsx imports Primer TextInput', () => {
  expect(page).toMatch(/import\s+{[^}]*\bTextInput\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
})

test('src/app/page.tsx imports Primer Button', () => {
  expect(page).toMatch(/import\s+{[^}]*\bButton\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
})

test('src/app/page.tsx uses a semantic form element', () => {
  expect(page).toMatch(/<form(?:\s[^>]*)?>[\s\S]*?<\/form>/)
})

test('src/app/page.tsx uses Primer FormControl', () => {
  expect(page).toMatch(/<FormControl(?:\s[^>]*)?>[\s\S]*?<\/FormControl>/)
})

test('src/app/page.tsx uses Primer TextInput', () => {
  expect(page).toMatch(/<TextInput(?:\s[^>]*)?\/>|<TextInput(?:\s[^>]*)?>[\s\S]*?<\/TextInput>/)
})

test('src/app/page.tsx uses Primer Button with type submit', () => {
  expect(page).toMatch(/<Button[^>]*type=["']submit["'][^>]*>[\s\S]*?<\/Button>/)
})
