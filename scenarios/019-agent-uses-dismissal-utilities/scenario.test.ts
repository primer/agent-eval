import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const app = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'App.tsx'), 'utf8')

test('imports the outside-click utility', () => {
  expect(app).toMatch(/import\s+{[^}]*\buseOnOutsideClick\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
  expect(app).toMatch(/\buseOnOutsideClick\(/)
})

test('imports the Escape-key utility', () => {
  expect(app).toMatch(/import\s+{[^}]*\buseOnEscapePress\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
  expect(app).toMatch(/\buseOnEscapePress\(/)
})

test('does not add global event listeners directly', () => {
  expect(app).not.toMatch(/(?:window|document)\.addEventListener\(/)
})
