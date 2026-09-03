import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const app = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'App.tsx'), 'utf8')

test('uses skeleton components for the loading state', () => {
  expect(app).toMatch(
    /import\s+{[^}]*(?:SkeletonBox|SkeletonText)[^}]*}\s+from\s+['"]@primer\/react(?:\/experimental)?['"]/,
  )
  expect(app).toMatch(/<(?:SkeletonBox|SkeletonText)\b/)
})

test('uses Blankslate for the empty state', () => {
  expect(app).toMatch(/import\s+{[^}]*\bBlankslate\b[^}]*}\s+from\s+['"]@primer\/react\/experimental['"]/)
  expect(app).toMatch(/<Blankslate(?:\s[^>]*)?>[\s\S]*<\/Blankslate>/)
})

test('gives the empty state a create-repository action', () => {
  expect(app).toMatch(/<Blankslate[\s\S]*(?:Create|New) repository[\s\S]*<\/Blankslate>/i)
})

test('renders the states conditionally', () => {
  expect(app).toMatch(/\bisLoading\b[\s\S]*(?:SkeletonBox|SkeletonText)/)
  expect(app).toMatch(/repositories\.length[\s\S]*Blankslate|Blankslate[\s\S]*repositories\.length/)
})
