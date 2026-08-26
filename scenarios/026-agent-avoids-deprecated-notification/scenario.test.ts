import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const app = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'App.tsx'), 'utf8')

test('uses the current Banner component', () => {
  expect(app).toMatch(/import\s+{[^}]*\bBanner\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
  expect(app).toMatch(/<Banner[^>]*variant=["']warning["'][^>]*>/)
})

test('makes the warning dismissible', () => {
  expect(app).toMatch(/<Banner[^>]*\bonDismiss=/)
})

test('links to branch protection settings', () => {
  expect(app).toMatch(/<Banner[\s\S]*branch protection[\s\S]*(?:href|Link)[\s\S]*<\/Banner>/i)
})

test('does not use the deprecated Flash component', () => {
  expect(app).not.toMatch(/\bFlash\b/)
})
