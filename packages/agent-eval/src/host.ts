import fs from 'node:fs'
import {pathToFileURL} from 'node:url'
import {memfs, Volume, type NestedDirectoryJSON} from 'memfs'
import tarFs from 'tar-fs'
import {SystemSandbox, VirtualSandbox, type Sandbox, type SandboxCreateOptions} from './sandbox'

type FileSystem = typeof import('node:fs')

interface Host {
  fs: FileSystem
  archive: Pick<typeof tarFs, 'pack' | 'extract'>
  loadModule<T = unknown>(filepath: string): Promise<T>
  createSandbox: (options?: SandboxCreateOptions) => Promise<Sandbox>
}

class SystemHost implements Host {
  static async create() {
    return new SystemHost()
  }

  fs: FileSystem
  archive: Host['archive']

  constructor() {
    this.fs = fs
    this.archive = createArchive(this.fs)
  }

  loadModule<T = unknown>(filepath: string): Promise<T> {
    if (filepath.startsWith('file:') || filepath.startsWith('data:')) {
      return import(filepath)
    }
    return import(pathToFileURL(filepath).href)
  }

  createSandbox(options?: SandboxCreateOptions): Promise<Sandbox> {
    return SystemSandbox.create(options)
  }
}

class VirtualHost implements Host {
  static create(json?: NestedDirectoryJSON) {
    return new VirtualHost(json)
  }

  fs: FileSystem
  archive: Host['archive']
  vol: Volume

  constructor(json?: NestedDirectoryJSON) {
    const {fs: virtualFs, vol} = memfs(json)
    this.vol = vol
    // @ts-expect-error - not every constant is exposed but memfs should match
    // for our test cases
    this.fs = virtualFs
    this.archive = createArchive(this.fs)
  }

  async loadModule<T = unknown>(filepath: string): Promise<T> {
    const contents = await this.fs.promises.readFile(filepath, 'utf-8')
    const encodedContent = Buffer.from(contents).toString('base64')
    const dataUri = `data:text/javascript;base64,${encodedContent}`
    return await import(dataUri)
  }

  createSandbox(options?: SandboxCreateOptions): Promise<Sandbox> {
    return VirtualSandbox.create({
      host: this,
      ...options,
    })
  }
}

function createArchive(fs: FileSystem): Host['archive'] {
  return {
    pack(directory, options) {
      const packOptions = {
        ...options,
        fs,
      }
      return tarFs.pack(directory, packOptions)
    },
    extract(directory, options) {
      const extractOptions = {
        ...options,
        fs,
      }
      return tarFs.extract(directory, extractOptions)
    },
  }
}

const DefaultHost = new SystemHost()

export {SystemHost, VirtualHost, DefaultHost}
export type {Host}
