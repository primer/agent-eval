import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const packageJson = JSON.parse(await fs.readFile(path.resolve(import.meta.dirname, 'package.json'), 'utf8'))
const app = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'App.tsx'), 'utf8')
const main = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'main.tsx'), 'utf8')
const source = `${app}\n${main}`
const dependencies = {...packageJson.dependencies, ...packageJson.devDependencies}

test('installs the design-system packages', () => {
  expect(dependencies).toHaveProperty('@primer/react')
  expect(dependencies).toHaveProperty('@primer/primitives')
})

test('loads base primitives and light and dark themes', () => {
  expect(source).toMatch(/@primer\/primitives\/dist\/css\/primitives\.css/)
  expect(source).toMatch(/@primer\/primitives\/dist\/css\/functional\/themes\/light\.css/)
  expect(source).toMatch(/@primer\/primitives\/dist\/css\/functional\/themes\/dark\.css/)
})

test('wraps the application in BaseStyles', () => {
  expect(source).toMatch(/import\s+{[^}]*\bBaseStyles\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
  expect(source).toMatch(/<BaseStyles(?:\s[^>]*)?>[\s\S]*<\/BaseStyles>/)
})

test('demonstrates a current design-system component', () => {
  expect(app).toMatch(/import\s+{[^}]*(?:\bButton\b|\bBanner\b|\bCard\b)[^}]*}\s+from\s+['"]@primer\/react['"]/)
})
