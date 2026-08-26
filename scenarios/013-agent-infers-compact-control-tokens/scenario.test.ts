import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const styles = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'styles.css'), 'utf8')

test('uses compact control size or padding tokens', () => {
  expect(styles).toMatch(/var\(--control-(?:xsmall|small)-(?:size|padding(?:Block|Inline-[A-Za-z]+))\)/)
})

test('uses a token for spacing between toolbar controls', () => {
  expect(styles).toMatch(/var\(--(?:controlStack|stack)-[A-Za-z0-9-]*gap[A-Za-z0-9-]*\)/)
})

test('does not use raw pixel values for control sizing', () => {
  expect(styles).not.toMatch(/(?:gap|height|padding(?:-block|-inline)?):\s*\d+px/)
})
