import nodeFs from 'node:fs'
import fs from 'node:fs/promises'
import {syncBuiltinESMExports} from 'node:module'
import {onTestFinished, vi} from 'vitest'
import {VirtualHost} from '../../packages/agent-eval/src/host'

function createTestFileSystem(): typeof fs {
  const host = VirtualHost.create()
  const memory = host.fs.promises

  vi.spyOn(fs, 'access').mockImplementation(memory.access)
  vi.spyOn(fs, 'lstat').mockImplementation(memory.lstat)
  vi.spyOn(fs, 'readFile').mockImplementation(memory.readFile)
  vi.spyOn(fs, 'readdir').mockImplementation(memory.readdir)
  vi.spyOn(fs, 'realpath').mockImplementation(memory.realpath)
  vi.spyOn(fs, 'stat').mockImplementation(memory.stat)
  const existsSync = vi.spyOn(nodeFs, 'existsSync').mockImplementation(host.fs.existsSync)
  syncBuiltinESMExports()
  onTestFinished(() => {
    existsSync.mockRestore()
    syncBuiltinESMExports()
  })

  return memory
}

export {createTestFileSystem}
