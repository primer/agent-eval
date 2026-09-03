import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const app = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'App.tsx'), 'utf8')
const styles = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'styles.css'), 'utf8')
const source = `${app}\n${styles}`

test('uses Tailwind utility classes on the deployment panel', () => {
  expect(app).toMatch(/className=["'][^"']*(?:bg-|text-|border-|p-|gap-)[^"']*["']/)
})

test('uses semantic status tokens with Tailwind', () => {
  expect(source).toMatch(/var\(--(?:bgColor|fgColor|borderColor)-success(?:-[A-Za-z0-9-]+)?\)/)
})

test('uses stack tokens for panel spacing', () => {
  expect(source).toMatch(/var\(--stack-(?:gap|padding)-[A-Za-z0-9-]+\)/)
})

test('does not introduce raw hexadecimal colors', () => {
  expect(source).not.toMatch(/#[\da-f]{3,8}\b/i)
})
