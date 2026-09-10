import fs from 'node:fs/promises'
import path from 'node:path'
import {afterEach, beforeEach, expect, test, vi} from 'vitest'
import {getWorkspaceFiles, type WorkspaceEntry, type WorkspaceFile} from './workspace-files'
import {getArtifactCandidates} from './artifacts'
import {createExperimentRunDetails} from './run-details'
import type {RunOutputResult} from './runs'

let directory: string
let workspace: string

beforeEach(async () => {
  const temporaryDirectory = path.resolve('.agents/tmp')
  await fs.mkdir(temporaryDirectory, {recursive: true})
  directory = await fs.mkdtemp(path.join(temporaryDirectory, 'workspace-files-'))
  workspace = path.join(directory, 'artifacts/trial/workspace')
  await fs.mkdir(workspace, {recursive: true})
})

afterEach(async () => {
  vi.restoreAllMocks()
  await fs.rm(directory, {recursive: true, force: true})
})

async function writeFile(name: string, content: string | Buffer) {
  const filepath = path.join(workspace, name)
  await fs.mkdir(path.dirname(filepath), {recursive: true})
  await fs.writeFile(filepath, content)
}

async function loadEntries(): Promise<Array<WorkspaceEntry>> {
  const result = await getWorkspaceFiles('artifacts/trial/workspace', directory)
  expect(result.type).toBe('available')
  if (result.type !== 'available') {
    throw new Error(result.reason)
  }
  return result.entries
}

function getFile(entries: Array<WorkspaceEntry>, name: string): WorkspaceFile {
  const file = entries.find(entry => {
    return entry.name === name
  })
  if (file?.type !== 'file') {
    throw new Error(`File ${name} not found`)
  }
  return file
}

test('loads nested files with directories first, natural sorting, and exact text', async () => {
  const content = '<script>alert("not executed")</script>\n\tconst greeting = "hello"\n'
  await writeFile('src/app/page.tsx', content)
  await writeFile('file10.txt', 'ten')
  await writeFile('file2.txt', 'two')
  await writeFile('.gitignore', 'node_modules\n')
  await writeFile('empty.txt', '')
  const entries = await loadEntries()
  expect(
    entries.map(entry => {
      return entry.name
    }),
  ).toEqual(['src', '.gitignore', 'empty.txt', 'file2.txt', 'file10.txt'])
  expect(entries[0]).toMatchObject({
    type: 'directory',
    path: 'src',
    children: [
      {
        type: 'directory',
        path: 'src/app',
        children: [
          {
            type: 'file',
            path: 'src/app/page.tsx',
            size: Buffer.byteLength(content),
            preview: {type: 'text', content},
          },
        ],
      },
    ],
  })
  expect(getFile(entries, 'empty.txt').preview).toEqual({type: 'text', content: ''})
})

test('omits dependency, build, and Git directories at every level', async () => {
  for (const name of ['node_modules', '.next', '.turbo', 'dist', '.git']) {
    await writeFile(`${name}/ignored.txt`, 'ignored')
    await writeFile(`src/${name}/ignored.txt`, 'ignored')
  }
  expect(await loadEntries()).toEqual([{type: 'directory', name: 'src', path: 'src', children: []}])
})

test('preserves regular files named like excluded directories at every level', async () => {
  const names = ['node_modules', '.next', '.turbo', 'dist', '.git']
  for (const name of names) {
    await writeFile(name, `root ${name}`)
    await writeFile(`src/${name}`, `nested ${name}`)
  }

  const entries = await loadEntries()
  const src = entries[0]
  if (src.type !== 'directory') {
    throw new Error('Expected the src directory')
  }
  for (const name of names) {
    expect(getFile(entries, name).preview).toEqual({type: 'text', content: `root ${name}`})
    expect(getFile(src.children, name).preview).toEqual({type: 'text', content: `nested ${name}`})
  }
})

test('reports missing and empty workspaces separately', async () => {
  expect(await getWorkspaceFiles(undefined, directory)).toMatchObject({type: 'unavailable'})
  expect(await getWorkspaceFiles('artifacts/missing/workspace', directory)).toMatchObject({type: 'unavailable'})
  expect(await getWorkspaceFiles('artifacts/trial/workspace', directory)).toEqual({
    type: 'available',
    entries: [],
    truncated: false,
  })
})

test('resolves relocated absolute artifact paths', async () => {
  await writeFile('README.md', 'portable')
  const result = await getWorkspaceFiles('/old/runner/artifacts/trial/workspace', directory)
  expect(result).toMatchObject({
    type: 'available',
    entries: [{name: 'README.md', preview: {type: 'text', content: 'portable'}}],
  })
})

test('rejects paths outside artifact roots and sibling paths with matching prefixes', async () => {
  expect(getArtifactCandidates('../outside', directory)).toEqual([])
  expect(getArtifactCandidates('artifacts/../../outside', directory)).toEqual([])
  expect(getArtifactCandidates('artifacts-other/workspace', directory)).toEqual([])
  expect(await getWorkspaceFiles('../outside', directory)).toMatchObject({type: 'unavailable'})
})

test('does not follow workspace symlinks outside the artifact root', async () => {
  const outside = path.join(directory, 'outside')
  await fs.mkdir(outside)
  await fs.writeFile(path.join(outside, 'private.txt'), 'not part of the bundle')
  await fs.symlink(outside, path.join(directory, 'artifacts/linked'))
  expect(await getWorkspaceFiles('artifacts/linked', directory)).toEqual({
    type: 'unavailable',
    reason: 'The generated workspace points outside the result artifacts.',
  })
})

test('does not follow a symlinked artifacts directory', async () => {
  await fs.rename(path.join(directory, 'artifacts'), path.join(directory, 'outside'))
  await fs.symlink(path.join(directory, 'outside'), path.join(directory, 'artifacts'))
  expect(await getWorkspaceFiles('artifacts/trial/workspace', directory)).toMatchObject({
    type: 'unavailable',
    reason: 'The generated workspace points outside the result artifacts.',
  })
})

test('does not follow file links, directory links, or symlink loops', async () => {
  await fs.writeFile(path.join(directory, 'private.txt'), 'not part of the workspace')
  await fs.symlink(path.join(directory, 'private.txt'), path.join(workspace, 'linked.txt'))
  await fs.symlink(workspace, path.join(workspace, 'loop'))
  const entries = await loadEntries()
  expect(entries).toHaveLength(2)
  for (const entry of entries) {
    expect(entry).toMatchObject({type: 'file', preview: {type: 'unavailable'}})
    expect(JSON.stringify(entry)).not.toContain('not part of the workspace')
  }
})

test('identifies binary and non-UTF-8 files without corrupting previews', async () => {
  await writeFile('binary.png', Buffer.from([0, 1, 2]))
  await writeFile('invalid.txt', Buffer.from([255, 254, 253]))
  for (const entry of await loadEntries()) {
    expect(entry).toMatchObject({
      preview: {type: 'unavailable', reason: 'Binary files cannot be previewed.'},
    })
  }
})

test('enforces the exact per-file byte limit', async () => {
  await writeFile('allowed.txt', 'a'.repeat(256 * 1024))
  await writeFile('large.txt', 'a'.repeat(256 * 1024 + 1))
  const entries = await loadEntries()
  expect(getFile(entries, 'allowed.txt').preview.type).toBe('text')
  expect(getFile(entries, 'large.txt').preview).toEqual({
    type: 'unavailable',
    reason: 'This file exceeds the 256 KiB preview limit.',
  })
})

test('enforces the total workspace preview byte limit', async () => {
  for (let index = 0; index < 9; index++) {
    await writeFile(`${index}.txt`, 'a'.repeat(256 * 1024))
  }
  const entries = await loadEntries()
  expect(
    entries.filter(entry => {
      return entry.type === 'file' && entry.preview.type === 'text'
    }),
  ).toHaveLength(8)
  expect(getFile(entries, '8.txt').preview).toEqual({
    type: 'unavailable',
    reason: 'The 2 MiB workspace preview limit has been reached.',
  })
})

test('limits tree entries and reports truncation', async () => {
  for (let index = 0; index < 2001; index++) {
    await writeFile(`${index}.txt`, '')
  }
  const result = await getWorkspaceFiles('artifacts/trial/workspace', directory)
  expect(result).toMatchObject({type: 'available', truncated: true})
  if (result.type === 'available') {
    expect(result.entries).toHaveLength(2000)
  }
})

test.each([0, 49, 50, 51])('enforces the 50-level limit for a file at depth %i', async depth => {
  await writeFile(`${'nested/'.repeat(depth)}file.txt`, 'file contents')
  const result = await getWorkspaceFiles('artifacts/trial/workspace', directory)
  if (result.type !== 'available') {
    throw new Error(result.reason)
  }
  expect(result.truncated).toBe(depth > 50)

  let entries = result.entries
  for (let level = 0; level < Math.min(depth, 50); level++) {
    expect(entries).toHaveLength(1)
    const entry = entries[0]
    if (entry.type !== 'directory') {
      throw new Error(`Expected a directory at level ${level + 1}`)
    }
    entries = entry.children
  }
  if (depth <= 50) {
    expect(getFile(entries, 'file.txt').preview).toEqual({type: 'text', content: 'file contents'})
  } else {
    expect(entries).toEqual([])
  }
})

test('reports a file used as a workspace', async () => {
  await writeFile('file.txt', 'text')
  expect(await getWorkspaceFiles('artifacts/trial/workspace/file.txt', directory)).toMatchObject({
    type: 'unavailable',
    reason: 'The generated workspace is not a directory.',
  })
})

test('propagates unexpected filesystem errors instead of reporting missing files', async () => {
  vi.spyOn(fs, 'readdir').mockRejectedValueOnce(new Error('Permission denied'))
  await expect(getWorkspaceFiles('artifacts/trial/workspace', directory)).rejects.toThrow('Permission denied')
})

test('includes generated files in experiment run details without changing existing details', async () => {
  await writeFile('index.ts', 'export const generated = true\n')
  const result: RunOutputResult = {
    id: 'trial',
    treatmentId: 'control',
    model: 'gpt-5.6-sol',
    reasoningEffort: 'medium',
    scenarioId: 'scenario',
    workspaceDirectory: 'artifacts/trial/workspace',
    assistant: {
      logs: [],
      turns: 1,
      outputTokens: 10,
      premiumRequests: 1,
      totalApiDurationMs: 10,
      sessionDurationMs: 20,
      tools: {},
    },
    testResults: {
      numTotalTests: 0,
      numPassedTests: 0,
      numFailedTests: 0,
      numPendingTests: 0,
      numTodoTests: 0,
      success: true,
      testResults: [],
      tests: [],
    },
    walkthrough: {type: 'Unavailable'},
    judges: [],
  }
  const details = await createExperimentRunDetails(
    '2026-09-10',
    {
      experiment: {id: 'experiment', models: []},
      scenarios: [],
      treatments: [{id: 'control', config: {name: 'Control'}}],
      results: [result],
    },
    directory,
  )
  expect(details.results[0]).toMatchObject({
    id: 'trial',
    treatment: 'Control',
    walkthrough: {type: 'Unavailable'},
    transcript: [],
    workspace: {
      type: 'available',
      entries: [{path: 'index.ts', preview: {type: 'text', content: 'export const generated = true\n'}}],
    },
  })
})
