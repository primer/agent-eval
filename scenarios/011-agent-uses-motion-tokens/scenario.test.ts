import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const styles = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'styles.css'), 'utf8')

test('uses a motion token for the transition', () => {
  expect(styles).toMatch(/var\(--motion-(?:transition|duration|easing)-[A-Za-z0-9-]+\)/)
})

test('defines a reduced-motion alternative', () => {
  expect(styles).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
})

test('does not use raw transition timing values', () => {
  expect(styles).not.toMatch(/(?:transition|animation)[^;]*(?:\d+m?s|ease(?:-in|-out|-in-out)?)/)
})
