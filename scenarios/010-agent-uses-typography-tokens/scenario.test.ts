import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const styles = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'styles.css'), 'utf8')

test('uses a title typography shorthand token', () => {
  expect(styles).toMatch(/font:\s*var\(--text-title-shorthand-(?:small|medium|large)\)/)
})

test('uses a body typography shorthand token', () => {
  expect(styles).toMatch(/font:\s*var\(--text-body-shorthand-(?:small|medium|large)\)/)
})

test('uses code typography shorthand tokens', () => {
  expect(styles).toMatch(/font:\s*var\(--text-codeInline-shorthand\)/)
  expect(styles).toMatch(/font:\s*var\(--text-codeBlock-shorthand\)/)
})

test('does not set raw font sizes or line heights', () => {
  expect(styles).not.toMatch(/(?:font-size|line-height):\s*(?:\d|calc\()/)
})
