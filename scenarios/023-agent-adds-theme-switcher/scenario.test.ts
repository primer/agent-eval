import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const app = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'App.tsx'), 'utf8')
const main = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'main.tsx'), 'utf8')
const source = `${app}\n${main}`

test.each(['system', 'light', 'dark'])('offers the %s appearance choice', choice => {
  expect(source).toMatch(new RegExp(`(?:value=["']${choice}["']|>${choice}<)`, 'i'))
})

test('persists the appearance preference', () => {
  expect(source).toMatch(/localStorage\.setItem\(/)
  expect(source).toMatch(/localStorage\.getItem\(/)
})

test('applies the selected theme using data attributes', () => {
  expect(source).toMatch(/(?:dataset|setAttribute\()[\s\S]*(?:colorMode|data-color-mode)/)
})

test('supports the system appearance setting', () => {
  expect(source).toMatch(/matchMedia\(['"]\(prefers-color-scheme:\s*dark\)['"]\)/)
})
