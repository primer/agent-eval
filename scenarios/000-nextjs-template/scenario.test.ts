import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const pagePath = path.resolve(import.meta.dirname, 'src', 'app', 'page.tsx')
const page = await fs.readFile(pagePath, 'utf8')

test('src/app/page.tsx example test', () => {
  expect(page).toMatch(/function IndexPage/)
})
