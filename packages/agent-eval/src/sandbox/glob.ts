import {fileURLToPath} from 'node:url'
import {
  glob,
  type FSOption,
  type GlobOptions,
  type GlobOptionsWithFileTypesFalse,
  type GlobOptionsWithFileTypesTrue,
  type GlobOptionsWithFileTypesUnset,
  type Path,
} from 'glob'
import {CONTAINER_WORKDIR} from './constants'
import {resolveContainerPath} from './path'

type GlobFileSystem = Required<Pick<NonNullable<FSOption['promises']>, 'lstat' | 'readdir' | 'readlink' | 'realpath'>>

function createSandboxGlob(fs: GlobFileSystem): typeof glob.glob {
  function sandboxGlob(pattern: string | Array<string>, options?: GlobOptionsWithFileTypesUnset): Promise<Array<string>>
  function sandboxGlob(pattern: string | Array<string>, options: GlobOptionsWithFileTypesTrue): Promise<Array<Path>>
  function sandboxGlob(pattern: string | Array<string>, options: GlobOptionsWithFileTypesFalse): Promise<Array<string>>
  function sandboxGlob(pattern: string | Array<string>, options: GlobOptions): Promise<Array<Path> | Array<string>>
  async function sandboxGlob(
    pattern: string | Array<string>,
    options: GlobOptions = {},
  ): Promise<Array<Path> | Array<string>> {
    let filesystemError: GlobFileSystemError | undefined
    async function track<T>(operation: Promise<T>): Promise<T> {
      try {
        return await operation
      } catch (error) {
        if (error instanceof GlobFileSystemError) {
          filesystemError ??= error
        }
        throw error
      }
    }

    const promises: GlobFileSystem = {
      lstat: filepath => track(fs.lstat(filepath)),
      readdir: (filepath, opts) => track(fs.readdir(filepath, opts)),
      readlink: filepath => track(fs.readlink(filepath)),
      realpath: filepath => track(fs.realpath(filepath)),
    }
    const adapter: FSOption = {
      promises,
      readdir(filepath, opts, callback) {
        promises.readdir(filepath, opts).then(entries => callback(null, entries), callback)
      },
      // Never fall back to the host filesystem for synchronous Path methods.
      lstatSync: unsupportedSync,
      readdirSync: unsupportedSync,
      readlinkSync: unsupportedSync,
      realpathSync: unsupportedSync,
    }
    const cwd =
      options.cwd instanceof URL || options.cwd?.startsWith('file://')
        ? fileURLToPath(options.cwd)
        : (options.cwd ?? CONTAINER_WORKDIR)
    const matches = await glob(pattern, {
      platform: 'linux',
      ...options,
      cwd: resolveContainerPath(cwd),
      fs: options.fs ?? adapter,
    })
    // Glob suppresses filesystem errors, but transport/protocol failures must reject.
    if (filesystemError) {
      throw filesystemError
    }
    return matches
  }

  return sandboxGlob
}

class GlobFileSystemError extends Error {}

function unsupportedSync(): never {
  throw new Error('Synchronous filesystem operations are not supported by sandbox.glob')
}

export {createSandboxGlob, GlobFileSystemError}
export type {GlobFileSystem}
