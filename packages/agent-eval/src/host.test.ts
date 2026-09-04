import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {expect, test} from 'vitest'
import {DefaultHost, SystemHost, VirtualHost} from './host'

test('SystemHost provides access to the system filesystem and module loader', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-eval-host-'))
  const textFilepath = path.join(directory, 'example.txt')
  const moduleFilepath = path.join(directory, 'example.mjs')

  try {
    await fs.writeFile(textFilepath, 'example')
    await fs.writeFile(moduleFilepath, 'export const value = "loaded"')

    const host = await SystemHost.create()

    expect(host.existsSync(textFilepath)).toBe(true)
    await expect(host.fs.readFile(textFilepath, 'utf8')).resolves.toBe('example')
    await expect(host.loadModule<{value: string}>(moduleFilepath)).resolves.toMatchObject({
      value: 'loaded',
    })
    await expect(host.loadModule<{value: string}>(pathToFileURL(moduleFilepath).href)).resolves.toMatchObject({
      value: 'loaded',
    })
  } finally {
    await fs.rm(directory, {recursive: true, force: true})
  }
})

test('DefaultHost is a system host', () => {
  expect(DefaultHost).toBeInstanceOf(SystemHost)
})

test('VirtualHost provides access to an in-memory filesystem and module loader', async () => {
  const host = VirtualHost.create({
    '/example.txt': 'example',
    '/example.mjs': 'export const value = "loaded"',
  })

  expect(host.existsSync('/example.txt')).toBe(true)
  expect(host.existsSync('/missing.txt')).toBe(false)
  await expect(host.fs.readFile('/example.txt', 'utf8')).resolves.toBe('example')
  await expect(host.loadModule<{value: string}>('/example.mjs')).resolves.toMatchObject({
    value: 'loaded',
  })
})

test('VirtualHost creates an empty writable filesystem by default', async () => {
  const host = VirtualHost.create()

  await host.fs.writeFile('/example.txt', 'example')

  expect(host.vol.readFileSync('/example.txt', 'utf8')).toBe('example')
})
