import {existsSync} from 'node:fs'
import fs from 'node:fs/promises'
import {memfs, Volume, type NestedDirectoryJSON} from 'memfs'

type FileSystem = typeof import('node:fs/promises')

interface Host {
  existsSync: typeof existsSync
  fs: FileSystem
  loadModule<T = unknown>(filepath: string): Promise<T>
}

class SystemHost implements Host {
  static create() {
    return new SystemHost()
  }

  existsSync: typeof existsSync
  fs: FileSystem

  constructor() {
    this.existsSync = existsSync
    this.fs = fs
  }

  loadModule<T = unknown>(filepath: string): Promise<T> {
    return import(filepath)
  }
}

class VirtualHost implements Host {
  static create(json?: NestedDirectoryJSON) {
    return new VirtualHost(json)
  }

  existsSync: typeof existsSync
  fs: FileSystem
  vol: Volume

  constructor(json?: NestedDirectoryJSON) {
    const {fs, vol} = memfs(json)
    this.vol = vol
    this.existsSync = fs.existsSync
    // @ts-expect-error - not every constant is exposed but memfs should match
    // for our test cases
    this.fs = fs.promises
  }

  async loadModule<T = unknown>(filepath: string): Promise<T> {
    const contents = await this.fs.readFile(filepath, 'utf-8')
    const encodedContent = Buffer.from(contents).toString('base64')
    const dataUri = `data:text/javascript;base64,${encodedContent}`
    return await import(dataUri)
  }
}

const DefaultHost = new SystemHost()

export {SystemHost, VirtualHost, DefaultHost}
export type {Host}
