import {execFile} from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import {promisify} from 'node:util'
import {expect, test} from 'vitest'

test('@primer/agent-eval publishes the built UI without development sources or caches', async () => {
  const directory = path.resolve(import.meta.dirname, '..')
  const {stdout} = await promisify(execFile)('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: directory,
  })
  const [archive]: Array<{files: Array<{path: string}>}> = JSON.parse(stdout)
  const files = archive.files.map(file => {
    return file.path
  })

  expect(files).toContain('dist/ui/.next/BUILD_ID')
  expect(files).toContain('dist/ui/next.config.js')
  expect(files).toContain('dist/ui/externals/package.json')
  const aliases = await fs.readdir(path.resolve(directory, '..', 'ui', '.next', 'node_modules'))
  for (const alias of aliases) {
    expect(files).toContain(`dist/ui/externals/${alias}.js`)
  }
  expect(
    files.some(file => {
      return file.startsWith('dist/ui/.next/static/') && file.endsWith('.js')
    }),
  ).toBe(true)
  expect(
    files.some(file => {
      return (
        file.startsWith('src/') ||
        file.startsWith('dist/ui/.next/cache/') ||
        file.startsWith('dist/ui/.next/dev/') ||
        file.startsWith('dist/ui/.next/standalone/')
      )
    }),
  ).toBe(false)
})
