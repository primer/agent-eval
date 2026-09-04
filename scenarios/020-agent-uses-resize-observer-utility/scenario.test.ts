import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const app = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'App.tsx'), 'utf8')

test('imports and calls useResizeObserver', () => {
  expect(app).toMatch(/import\s+{[^}]*\buseResizeObserver\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
  expect(app).toMatch(/\buseResizeObserver\(/)
})

test('uses observed dimensions for the chart', () => {
  expect(app).toMatch(/<(?:svg|rect)[^>]*(?:width|height)=\{[^}]+\}/)
})

test('does not instantiate ResizeObserver directly', () => {
  expect(app).not.toMatch(/new\s+ResizeObserver\(/)
})
