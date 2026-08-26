import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const app = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'App.tsx'), 'utf8')

test('uses the current ConfirmationDialog API', () => {
  expect(app).toMatch(/import\s+{[^}]*(?:\bConfirmationDialog\b|\buseConfirm\b)[^}]*}\s+from\s+['"]@primer\/react['"]/)
  expect(app).toMatch(/<ConfirmationDialog\b|\buseConfirm\(/)
})

test('does not use the deprecated Dialog component', () => {
  expect(app).not.toMatch(/<Dialog\b/)
})

test('provides clear cancel and destructive confirmation labels', () => {
  expect(app).toMatch(/cancel/i)
  expect(app).toMatch(/delete repository/i)
})

test('uses a danger-styled confirmation action', () => {
  expect(app).toMatch(/(?:confirmButtonType|variant)=["']danger["']/)
})
