import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const pagePath = path.resolve(import.meta.dirname, 'src', 'app', 'page.tsx')
const page = await fs.readFile(pagePath, 'utf8')

test('src/app/page.tsx imports Primer form components', () => {
  expect(page).toMatch(/import\s+{[^}]*\bButton\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
  expect(page).toMatch(/import\s+{[^}]*\bFormControl\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
  expect(page).toMatch(/import\s+{[^}]*\bTextInput\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
})

test('src/app/page.tsx uses a semantic form element', () => {
  expect(page).toMatch(/<form(?:\s[^>]*)?>[\s\S]*?<\/form>/)
})

test('src/app/page.tsx uses Primer FormControl labels and captions', () => {
  expect(page).toMatch(/<FormControl\.Label(?:\s[^>]*)?>[\s\S]*?<\/FormControl\.Label>/)
  expect(page).toMatch(/<FormControl\.Caption(?:\s[^>]*)?>[\s\S]*?<\/FormControl\.Caption>/)
})

test('src/app/page.tsx uses Primer validation feedback', () => {
  expect(page).toMatch(/<FormControl\.Validation[^>]*variant=["']error["'][^>]*>[\s\S]*?<\/FormControl\.Validation>/)
})

test('src/app/page.tsx uses email and password TextInput types', () => {
  expect(page).toMatch(/<TextInput[^>]*type=["']email["'][^>]*\/?>/)
  expect(page).toMatch(/<TextInput[^>]*type=["']password["'][^>]*\/?>/)
})

test('src/app/page.tsx uses autocomplete values for sign-up fields', () => {
  expect(page).toMatch(/autoComplete=["']email["']/)
  expect(page).toMatch(/autoComplete=["']new-password["']/)
})

test('src/app/page.tsx uses a primary submit button', () => {
  expect(page).toMatch(/<Button[^>]*type=["']submit["'][^>]*>[\s\S]*?<\/Button>/)
  expect(page).toMatch(/<Button[^>]*variant=["']primary["'][^>]*>[\s\S]*?<\/Button>/)
})
