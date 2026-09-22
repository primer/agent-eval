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
  const adapter: FSOption = {
    promises: fs,
    readdir(filepath, options, callback) {
      fs.readdir(filepath, options).then(entries => callback(null, entries), callback)
    },
    // Never fall back to the host filesystem for synchronous Path methods.
    lstatSync: unsupportedSync,
    readdirSync: unsupportedSync,
    readlinkSync: unsupportedSync,
    realpathSync: unsupportedSync,
  }

  function sandboxGlob(pattern: string | Array<string>, options?: GlobOptionsWithFileTypesUnset): Promise<Array<string>>
  function sandboxGlob(pattern: string | Array<string>, options: GlobOptionsWithFileTypesTrue): Promise<Array<Path>>
  function sandboxGlob(pattern: string | Array<string>, options: GlobOptionsWithFileTypesFalse): Promise<Array<string>>
  function sandboxGlob(pattern: string | Array<string>, options: GlobOptions): Promise<Array<Path> | Array<string>>
  function sandboxGlob(
    pattern: string | Array<string>,
    options: GlobOptions = {},
  ): Promise<Array<Path> | Array<string>> {
    const cwd = options.cwd instanceof URL ? fileURLToPath(options.cwd) : (options.cwd ?? CONTAINER_WORKDIR)
    return glob(pattern, {
      platform: 'linux',
      ...options,
      cwd: resolveContainerPath(cwd),
      fs: options.fs ?? adapter,
    })
  }

  return sandboxGlob
}

function unsupportedSync(): never {
  throw new Error('Synchronous filesystem operations are not supported by sandbox.glob')
}

export {createSandboxGlob}
export type {GlobFileSystem}
