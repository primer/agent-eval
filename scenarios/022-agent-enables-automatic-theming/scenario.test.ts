import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const app = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'App.tsx'), 'utf8')
const main = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'main.tsx'), 'utf8')
const html = await fs.readFile(path.resolve(import.meta.dirname, 'index.html'), 'utf8')
const source = `${app}\n${main}\n${html}`

test('loads the light and dark functional themes', () => {
  expect(source).toMatch(/@primer\/primitives\/dist\/css\/functional\/themes\/light\.css/)
  expect(source).toMatch(/@primer\/primitives\/dist\/css\/functional\/themes\/dark\.css/)
})

test('uses automatic color mode', () => {
  expect(source).toMatch(/data-color-mode(?:=|["']\s*,\s*)["']auto["']/)
})

test('configures light and dark themes', () => {
  expect(source).toMatch(/data-light-theme(?:=|["']\s*,\s*)["']light["']/)
  expect(source).toMatch(/data-dark-theme(?:=|["']\s*,\s*)["']dark["']/)
})
