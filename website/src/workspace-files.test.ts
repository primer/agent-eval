import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {afterEach, beforeEach, expect, test, vi} from 'vitest'
import {getResultFilesUrl} from './run-details'
import {readWorkspaceFiles} from './workspace-files'

let directory: string
let workspace: string

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-files-'))
  workspace = path.join(directory, 'artifacts', 'trial', 'workspace')
  await fs.mkdir(workspace, {recursive: true})
})

afterEach(async () => {
  await fs.rm(directory, {recursive: true, force: true})
  vi.unstubAllEnvs()
})

test('reads nested text and empty files with portable paths', async () => {
  await fs.mkdir(path.join(workspace, 'src'))
  await fs.writeFile(path.join(workspace, 'src', 'page.tsx'), '<h1>Hello</h1>')
  await fs.writeFile(path.join(workspace, 'empty.txt'), '')
  expect(await readWorkspaceFiles('artifacts/trial/workspace', directory)).toEqual({
    files: [
      {path: 'empty.txt', content: ''},
      {path: 'src/page.tsx', content: '<h1>Hello</h1>'},
    ],
    truncated: false,
  })
})

test('supports relocated absolute artifact paths', async () => {
  await fs.writeFile(path.join(workspace, 'hello.txt'), 'Hello')
  expect(await readWorkspaceFiles('/old/results/artifacts/trial/workspace', directory)).toEqual({
    files: [{path: 'hello.txt', content: 'Hello'}],
    truncated: false,
  })
})

test('handles missing workspaces and rejects traversal', async () => {
  await fs.writeFile(path.join(directory, 'outside.txt'), 'outside')
  for (const location of ['artifacts/missing/workspace', '.', 'artifacts/../', '/etc']) {
    expect(await readWorkspaceFiles(location, directory)).toEqual({files: [], truncated: false})
  }
})

test('excludes dependencies, build output, credential files, and symlinks', async () => {
  for (const name of ['node_modules', '.git', '.next', '.turbo', 'dist', 'build', 'coverage', '.ssh', '.aws']) {
    await fs.mkdir(path.join(workspace, name))
    await fs.writeFile(path.join(workspace, name, 'excluded.txt'), 'excluded')
  }
  for (const name of ['.env', '.env.local', '.npmrc', '.netrc', 'private.key', 'private.pem']) {
    await fs.writeFile(path.join(workspace, name), 'excluded')
  }
  await fs.writeFile(path.join(directory, 'outside.txt'), 'outside')
  await fs.symlink(path.join(directory, 'outside.txt'), path.join(workspace, 'linked.txt'))
  await fs.symlink(directory, path.join(workspace, 'linked-directory'))
  expect(await readWorkspaceFiles('artifacts/trial/workspace', directory)).toEqual({files: [], truncated: false})
})

test('rejects symlinks at the workspace root and in its ancestors', async () => {
  await fs.mkdir(path.join(directory, 'outside'))
  await fs.writeFile(path.join(directory, 'outside', 'outside.txt'), 'outside')
  await fs.rm(workspace, {recursive: true})
  await fs.symlink(path.join(directory, 'outside'), workspace)
  expect(await readWorkspaceFiles('artifacts/trial/workspace', directory)).toEqual({files: [], truncated: false})
  await fs.rm(path.join(directory, 'artifacts'), {recursive: true})
  await fs.symlink(path.join(directory, 'outside'), path.join(directory, 'artifacts'))
  expect(await readWorkspaceFiles('artifacts', directory)).toEqual({files: [], truncated: false})
})

test('provides placeholders for binary, invalid UTF-8, and oversized files', async () => {
  await fs.writeFile(path.join(workspace, 'binary.bin'), Buffer.from([0, 1, 2]))
  await fs.writeFile(path.join(workspace, 'invalid.bin'), Buffer.from([0xff]))
  await fs.writeFile(path.join(workspace, 'large.txt'), 'a'.repeat(256 * 1024 + 1))
  expect((await readWorkspaceFiles('artifacts/trial/workspace', directory)).files).toEqual([
    {path: 'binary.bin', unavailable: 'Binary files cannot be previewed.'},
    {path: 'invalid.bin', unavailable: 'Binary files cannot be previewed.'},
    {path: 'large.txt', unavailable: 'File is too large to preview.'},
  ])
})

test('bounds total preview bytes', async () => {
  for (let index = 0; index < 21; index++) {
    await fs.writeFile(path.join(workspace, `${index.toString().padStart(2, '0')}.txt`), 'a'.repeat(256 * 1024))
  }
  const result = await readWorkspaceFiles('artifacts/trial/workspace', directory)
  expect(result.files.filter(file => file.content !== undefined)).toHaveLength(20)
  expect(result.files.at(-1)?.unavailable).toBe('File is too large to preview.')
})

test('limits file count', async () => {
  await Promise.all(Array.from({length: 1001}, (_, index) => fs.writeFile(path.join(workspace, `${index}.txt`), '')))
  const result = await readWorkspaceFiles('artifacts/trial/workspace', directory)
  expect(result.files).toHaveLength(1000)
  expect(result.truncated).toBe(true)
})

test('builds encoded static file URLs including the Pages base path', () => {
  vi.stubEnv('PAGES_BASE_PATH', '/agent-eval')
  expect(getResultFilesUrl('experiments', 'an experiment', '2026-09-09', 'trial/#1')).toBe(
    '/agent-eval/result-files/experiments/an%20experiment/2026-09-09/trial%2F%231/files.json',
  )
  vi.stubEnv('PAGES_BASE_PATH', '')
  expect(getResultFilesUrl('benchmarks', 'design-system', '2026-09-09', 'trial')).toBe(
    '/result-files/benchmarks/design-system/2026-09-09/trial/files.json',
  )
})
