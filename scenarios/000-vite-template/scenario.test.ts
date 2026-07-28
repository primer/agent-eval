import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const appPath = path.resolve(import.meta.dirname, 'src', 'App.tsx')
const app = await fs.readFile(appPath, 'utf8')

test('src/App.tsx exports the example app', () => {
  expect(app).toMatch(/export function App/)
})
