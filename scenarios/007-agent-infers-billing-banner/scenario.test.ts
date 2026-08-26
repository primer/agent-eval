import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const app = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'App.tsx'), 'utf8')

test('imports the current Banner component', () => {
  expect(app).toMatch(/import\s+{[^}]*\bBanner\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
})

test('renders an attention Banner for the past-due state', () => {
  expect(app).toMatch(/<Banner[^>]*variant=["'](?:warning|critical)["'][^>]*>/)
  expect(app).toMatch(/past[- ]due/i)
})

test('does not use the deprecated Flash component', () => {
  expect(app).not.toMatch(/\bFlash\b/)
})

test('links to billing settings from the warning', () => {
  expect(app).toMatch(/<Banner[\s\S]*billing[\s\S]*<\/Banner>/i)
})
