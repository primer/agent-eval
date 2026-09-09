import fs from 'node:fs/promises'
import path from 'node:path'
import {getArtifactCandidates, isWithinDirectory} from './run-details'

export type WorkspaceFile = {
  path: string
  content?: string
  unavailable?: string
}

export type WorkspaceFiles = {
  files: Array<WorkspaceFile>
  truncated: boolean
}

const EXCLUDED_DIRECTORIES = new Set(['node_modules', '.git', '.next', '.turbo', 'dist', 'build', 'coverage'])
const MAX_FILES = 1000
const MAX_FILE_BYTES = 256 * 1024
const MAX_TOTAL_BYTES = 5 * 1024 * 1024

export async function readWorkspaceFiles(workspaceDirectory: string, runDirectory: string): Promise<WorkspaceFiles> {
  const result: WorkspaceFiles = {files: [], truncated: false}
  let totalBytes = 0

  async function visit(directory: string, prefix: string) {
    const entries = (await fs.readdir(directory, {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (result.files.length >= MAX_FILES) {
        result.truncated = true
        break
      }
      if (
        entry.isSymbolicLink() ||
        entry.name.startsWith('.env') ||
        ['.npmrc', '.netrc', '.ssh', '.aws'].includes(entry.name) ||
        /\.(pem|key|p12|pfx)$/i.test(entry.name)
      ) {
        continue
      }
      const filepath = path.join(directory, entry.name)
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
          await visit(filepath, relativePath)
        }
      } else if (entry.isFile()) {
        const {size} = await fs.stat(filepath)
        if (size > MAX_FILE_BYTES || totalBytes + size > MAX_TOTAL_BYTES) {
          result.files.push({path: relativePath, unavailable: 'File is too large to preview.'})
          continue
        }
        const bytes = await fs.readFile(filepath)
        totalBytes += bytes.length
        try {
          if (bytes.includes(0)) {
            throw new Error('Binary file')
          }
          const content = new TextDecoder('utf-8', {fatal: true}).decode(bytes)
          result.files.push({path: relativePath, content})
        } catch {
          result.files.push({path: relativePath, unavailable: 'Binary files cannot be previewed.'})
        }
      }
    }
  }

  for (const candidate of getArtifactCandidates(workspaceDirectory, runDirectory)) {
    try {
      const realDirectory = await fs.realpath(candidate)
      // Reject symlinked workspace roots or ancestors before reading any files.
      const repositoryRoot = path.resolve(process.cwd(), '..')
      const roots = [path.join(runDirectory, 'artifacts'), path.join(repositoryRoot, 'artifacts')]
      const allowed = await Promise.all(
        roots.map(async root => {
          if (!isWithinDirectory(root, candidate)) {
            return false
          }
          const parent = await fs.realpath(path.dirname(root))
          const realRoot = path.join(parent, path.basename(root))
          return realDirectory === path.join(realRoot, path.relative(root, candidate))
        }),
      )
      if (!allowed.some(Boolean) || !(await fs.lstat(candidate)).isDirectory()) {
        continue
      }
      await visit(realDirectory, '')
      return result
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        throw error
      }
    }
  }
  return result
}
