import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const appDir = path.resolve(import.meta.dirname, 'src', 'app')
const files = await readTextFiles(appDir)
const source = files.map(file => file.contents).join('\n')

async function readTextFiles(directory: string): Promise<Array<{path: string; contents: string}>> {
  const entries = await fs.readdir(directory, {withFileTypes: true})
  const files = await Promise.all(
    entries.map(async entry => {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        return readTextFiles(entryPath)
      }

      if (/\.(css|tsx?)$/.test(entry.name)) {
        return [{path: entryPath, contents: await fs.readFile(entryPath, 'utf8')}]
      }

      return []
    }),
  )

  return files.flat()
}

test('app imports Primer primitives CSS', () => {
  expect(source).toMatch(/import\s+(?:['"]@primer\/primitives\/dist\/css\/[^'"]+\.css['"]|[^'";]+\s+from\s+['"]@primer\/primitives['"])/)
})

test('app styles the announcement card with Primer CSS variable tokens', () => {
  const tokens = new Set(source.match(/var\(\s*--(?:bgColor|fgColor|borderColor|borderRadius|borderWidth|space)-[\w-]+\s*\)/g) ?? [])

  expect(tokens.size).toBeGreaterThanOrEqual(4)
})

test('app does not use raw color values for the announcement card styles', () => {
  expect(source).not.toMatch(/#[\da-f]{3,8}\b/i)
  expect(source).not.toMatch(/\b(?:rgb|hsl)a?\(/i)
})
