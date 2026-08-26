import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

const app = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'App.tsx'), 'utf8')

test('imports ActionMenu and ActionList from the design system', () => {
  expect(app).toMatch(/import\s+{[^}]*\bActionMenu\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
  expect(app).toMatch(/import\s+{[^}]*\bActionList\b[^}]*}\s+from\s+['"]@primer\/react['"]/)
})

test('renders an ActionMenu', () => {
  expect(app).toMatch(/<ActionMenu(?:\s[^>]*)?>[\s\S]*<\/ActionMenu>/)
})

test.each(['Archive', 'Transfer', 'Delete'])('includes the %s action', action => {
  expect(app).toContain(action)
})

test('marks the delete action as destructive', () => {
  expect(app).toMatch(/<ActionList\.Item[^>]*variant=["']danger["'][^>]*>[\s\S]*Delete/)
})
