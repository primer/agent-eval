import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const packageJsonPath = path.resolve(import.meta.dirname, 'package.json')
const layoutPath = path.resolve(import.meta.dirname, 'src', 'app', 'layout.tsx')
const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'))
const layout = await fs.readFile(layoutPath, 'utf8')
const dependencies = {
  ...packageJson.dependencies,
  ...packageJson.devDependencies,
}

test('includes @primer/react', () => {
  expect(dependencies).toHaveProperty('@primer/react')
})

test('includes @primer/primitives', () => {
  expect(dependencies).toHaveProperty('@primer/primitives')
})

test('src/app/layout.tsx imports Primer BaseStyles', () => {
  expect(layout).toMatch(/import\s+{[^}]*\bBaseStyles\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
})

test('src/app/layout.tsx uses Primer BaseStyles', () => {
  expect(layout).toMatch(/<BaseStyles(?:\s[^>]*)?>[\s\S]*?<\/BaseStyles>/)
})

test('src/app/layout.tsx configures automatic light and dark color modes', () => {
  const html = layout.match(/<html\b[^>]*>/)?.[0]

  expect(html).toBeDefined()
  expect(html).toMatch(/\bdata-color-mode=["']auto["']/)
  expect(html).toMatch(/\bdata-light-theme=["']light["']/)
  expect(html).toMatch(/\bdata-dark-theme=["']dark["']/)
})

test('src/app/layout.tsx imports the light color mode primitives', () => {
  expect(layout).toMatch(
    /import\s+['"]@primer\/primitives\/dist\/css\/functional\/themes\/light\.css['"]/,
  )
})

test('src/app/layout.tsx imports the dark color mode primitives', () => {
  expect(layout).toMatch(
    /import\s+['"]@primer\/primitives\/dist\/css\/functional\/themes\/dark\.css['"]/,
  )
})

test('src/app/layout.tsx does not import ThemeProvider', () => {
  expect(layout).not.toMatch(/\bThemeProvider\b/)
})
