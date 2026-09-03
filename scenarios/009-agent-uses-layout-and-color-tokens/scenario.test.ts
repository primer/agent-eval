import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const styles = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'styles.css'), 'utf8')

test('uses semantic background or foreground color tokens', () => {
  expect(styles).toMatch(/var\(--(?:bgColor|fgColor)-[A-Za-z0-9-]+\)/)
})

test('uses a semantic border token', () => {
  expect(styles).toMatch(/var\(--border(?:Color|Width)?-[A-Za-z0-9-]+\)/)
})

test('uses stack tokens for layout spacing', () => {
  expect(styles).toMatch(/var\(--stack-(?:gap|padding)-[A-Za-z0-9-]+\)/)
})

test('does not introduce raw hexadecimal colors', () => {
  expect(styles).not.toMatch(/#[\da-f]{3,8}\b/i)
})
