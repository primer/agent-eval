import * as z from 'zod/mini'
import {GlobFileSystemError, type GlobFileSystem} from './glob'
import type {CommandResult} from './types'

const fileTypeSchema = z.enum([
  'File',
  'Directory',
  'SymbolicLink',
  'BlockDevice',
  'CharacterDevice',
  'FIFO',
  'Socket',
  'Unknown',
])

function fileTypeMethods(type: z.infer<typeof fileTypeSchema>) {
  return {
    isFile: () => type === 'File',
    isDirectory: () => type === 'Directory',
    isSymbolicLink: () => type === 'SymbolicLink',
    isBlockDevice: () => type === 'BlockDevice',
    isCharacterDevice: () => type === 'CharacterDevice',
    isFIFO: () => type === 'FIFO',
    isSocket: () => type === 'Socket',
  }
}

const directorySchema = z.array(
  z.pipe(
    z.object({name: z.string(), parentPath: z.string(), type: fileTypeSchema}),
    z.transform(entry => ({...entry, ...fileTypeMethods(entry.type)})),
  ),
)

const statsSchema = z.pipe(
  z.object({
    type: fileTypeSchema,
    dev: z.number(),
    ino: z.number(),
    mode: z.number(),
    nlink: z.number(),
    uid: z.number(),
    gid: z.number(),
    rdev: z.number(),
    size: z.number(),
    blksize: z.number(),
    blocks: z.number(),
    atimeMs: z.number(),
    mtimeMs: z.number(),
    ctimeMs: z.number(),
    birthtimeMs: z.number(),
  }),
  z.transform(stats => ({
    ...stats,
    ...fileTypeMethods(stats.type),
    atime: new Date(stats.atimeMs),
    mtime: new Date(stats.mtimeMs),
    ctime: new Date(stats.ctimeMs),
    birthtime: new Date(stats.birthtimeMs),
    atimeInstant: Temporal.Instant.fromEpochNanoseconds(BigInt(Math.trunc(stats.atimeMs * 1e6))),
    mtimeInstant: Temporal.Instant.fromEpochNanoseconds(BigInt(Math.trunc(stats.mtimeMs * 1e6))),
    ctimeInstant: Temporal.Instant.fromEpochNanoseconds(BigInt(Math.trunc(stats.ctimeMs * 1e6))),
    birthtimeInstant: Temporal.Instant.fromEpochNanoseconds(BigInt(Math.trunc(stats.birthtimeMs * 1e6))),
  })),
)

const responseSchema = z.union([
  z.object({value: z.unknown()}),
  z.object({error: z.object({message: z.string(), code: z.optional(z.string())})}),
])

// Use argument passing, not shell interpolation, for paths supplied by glob.
const filesystemScript = `
const fs = require('node:fs/promises')
const [operation, filepath] = process.argv.slice(1)
const type = entry => ['File', 'Directory', 'SymbolicLink', 'BlockDevice', 'CharacterDevice', 'FIFO', 'Socket']
  .find(name => entry['is' + name]()) ?? 'Unknown'
try {
  let value
  switch (operation) {
    case 'readdir':
      value = (await fs.readdir(filepath, {withFileTypes: true}))
        .map(entry => ({name: entry.name, parentPath: entry.parentPath, type: type(entry)}))
      break
    case 'lstat': {
      const stats = await fs.lstat(filepath)
      value = {...stats, type: type(stats)}
      break
    }
    case 'readlink':
      value = await fs.readlink(filepath)
      break
    case 'realpath':
      value = await fs.realpath(filepath)
      break
    default:
      throw new Error('Unsupported filesystem operation')
  }
  process.stdout.write(JSON.stringify({value}))
} catch (error) {
  process.stdout.write(JSON.stringify({error: {message: error.message, code: error.code}}))
}
`

function createContainerGlobFileSystem(
  run: (command: string, args: Array<string>) => Promise<CommandResult>,
): GlobFileSystem {
  async function request<T>(operation: string, filepath: string, schema: z.ZodMiniType<T>): Promise<T> {
    let response: z.infer<typeof responseSchema>
    try {
      const result = await run('/opt/agent-eval/node/bin/node', [
        '--input-type=commonjs',
        '-e',
        `(async () => {${filesystemScript}})()`,
        '--',
        operation,
        filepath,
      ])
      response = z.parse(responseSchema, JSON.parse(result.stdout))
    } catch (cause) {
      throw new GlobFileSystemError('Failed to access the sandbox filesystem', {cause})
    }
    if ('error' in response) {
      throw Object.assign(new Error(response.error.message), {code: response.error.code})
    }
    try {
      return z.parse(schema, response.value)
    } catch (cause) {
      throw new GlobFileSystemError('Invalid sandbox filesystem response', {cause})
    }
  }

  return {
    readdir: filepath => request('readdir', filepath, directorySchema),
    lstat: filepath => request('lstat', filepath, statsSchema),
    readlink: filepath => request('readlink', filepath, z.string()),
    realpath: filepath => request('realpath', filepath, z.string()),
  }
}

export {createContainerGlobFileSystem}
