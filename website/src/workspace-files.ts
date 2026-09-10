import fs from 'node:fs/promises'
import {isUtf8} from 'node:buffer'
import path from 'node:path'
import {getArtifactCandidates, isWithinDirectory, LEGACY_ARTIFACTS_DIRECTORY} from './artifacts'

const MAX_FILE_BYTES = 256 * 1024
const MAX_WORKSPACE_BYTES = 2 * 1024 * 1024
const MAX_ENTRIES = 2000
const MAX_DEPTH = 50
const EXCLUDED_DIRECTORIES = new Set(['.git', '.next', '.turbo', 'node_modules', 'dist'])

type WorkspaceFile = {
  type: 'file'
  name: string
  path: string
  size: number
  preview: {type: 'text'; content: string} | {type: 'unavailable'; reason: string}
}

type WorkspaceEntry =
  | WorkspaceFile
  | {
      type: 'directory'
      name: string
      path: string
      children: Array<WorkspaceEntry>
    }

type WorkspaceFiles =
  {type: 'unavailable'; reason: string} | {type: 'available'; entries: Array<WorkspaceEntry>; truncated: boolean}

async function readWorkspace(directory: string): Promise<WorkspaceFiles> {
  let entryCount = 0
  let previewBytes = 0
  let truncated = false

  async function readDirectory(relativePath: string, depth: number): Promise<Array<WorkspaceEntry>> {
    if (depth >= MAX_DEPTH) {
      truncated = true
      return []
    }

    const entries = await fs.readdir(path.join(directory, relativePath), {withFileTypes: true})
    const sortedEntries = entries
      .filter(entry => {
        return !EXCLUDED_DIRECTORIES.has(entry.name)
      })
      .sort((first, second) => {
        return (
          Number(second.isDirectory()) - Number(first.isDirectory()) ||
          first.name.localeCompare(second.name, 'en', {numeric: true})
        )
      })
    const result: Array<WorkspaceEntry> = []

    for (const entry of sortedEntries) {
      if (entryCount >= MAX_ENTRIES) {
        truncated = true
        break
      }
      entryCount++
      const entryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        result.push({
          type: 'directory',
          name: entry.name,
          path: entryPath,
          children: await readDirectory(entryPath, depth + 1),
        })
        continue
      }

      const file: WorkspaceFile = {
        type: 'file',
        name: entry.name,
        path: entryPath,
        size: 0,
        preview: {type: 'unavailable', reason: 'Symbolic links and special files are not previewed.'},
      }
      result.push(file)
      if (!entry.isFile()) {
        continue
      }

      const filepath = path.join(directory, entryPath)
      const stats = await fs.stat(filepath)
      file.size = stats.size
      if (stats.size > MAX_FILE_BYTES) {
        file.preview = {type: 'unavailable', reason: 'This file exceeds the 256 KiB preview limit.'}
        continue
      }
      if (previewBytes + stats.size > MAX_WORKSPACE_BYTES) {
        file.preview = {type: 'unavailable', reason: 'The 2 MiB workspace preview limit has been reached.'}
        continue
      }

      const contents = await fs.readFile(filepath)
      if (contents.includes(0) || !isUtf8(contents)) {
        file.preview = {type: 'unavailable', reason: 'Binary files cannot be previewed.'}
        continue
      }
      previewBytes += contents.byteLength
      file.preview = {type: 'text', content: contents.toString('utf8')}
    }

    return result
  }

  const entries = await readDirectory('', 0)
  return {type: 'available', entries, truncated}
}

async function getWorkspaceFiles(
  workspaceDirectory: string | undefined,
  runDirectory: string,
): Promise<WorkspaceFiles> {
  if (!workspaceDirectory) {
    return {type: 'unavailable', reason: 'No generated workspace was recorded for this trial.'}
  }

  for (const candidate of getArtifactCandidates(workspaceDirectory, runDirectory)) {
    let realDirectory: string
    try {
      realDirectory = await fs.realpath(candidate)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue
      }
      throw error
    }

    const artifactRoot = isWithinDirectory(path.join(runDirectory, 'artifacts'), candidate)
      ? path.join(await fs.realpath(runDirectory), 'artifacts')
      : path.join(await fs.realpath(path.dirname(LEGACY_ARTIFACTS_DIRECTORY)), 'artifacts')
    if (!isWithinDirectory(artifactRoot, realDirectory)) {
      return {type: 'unavailable', reason: 'The generated workspace points outside the result artifacts.'}
    }

    if (!(await fs.stat(realDirectory)).isDirectory()) {
      return {type: 'unavailable', reason: 'The generated workspace is not a directory.'}
    }
    return readWorkspace(realDirectory)
  }

  return {type: 'unavailable', reason: 'The generated workspace is missing from this result bundle.'}
}

export {getWorkspaceFiles}
export type {WorkspaceEntry, WorkspaceFile, WorkspaceFiles}
