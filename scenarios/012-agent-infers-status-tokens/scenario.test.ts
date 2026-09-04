import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const app = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'App.tsx'), 'utf8')
const styles = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'styles.css'), 'utf8')

test('uses success tokens for successful deployments', () => {
  expect(styles).toMatch(/var\(--(?:bgColor|fgColor|borderColor)-success(?:-[A-Za-z0-9-]+)?\)/)
})

test('uses danger tokens for failed deployments', () => {
  expect(styles).toMatch(/var\(--(?:bgColor|fgColor|borderColor)-danger(?:-[A-Za-z0-9-]+)?\)/)
})

test('uses a non-text status indicator', () => {
  expect(app).toMatch(/@primer\/octicons-react/)
  expect(app).toMatch(/(?:Check|Pass|X|Stop|Alert)[A-Za-z]*Icon/)
})

test('does not introduce raw hexadecimal colors', () => {
  expect(styles).not.toMatch(/#[\da-f]{3,8}\b/i)
})
