import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {pipeline} from 'node:stream/promises'
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

    expect(host.fs.existsSync(textFilepath)).toBe(true)
    await expect(host.fs.promises.readFile(textFilepath, 'utf8')).resolves.toBe('example')
    await expect(host.loadModule<{value: string}>(moduleFilepath)).resolves.toMatchObject({
      value: 'loaded',
    })
    await expect(host.loadModule<{value: string}>(pathToFileURL(moduleFilepath).href)).resolves.toMatchObject({
      value: 'loaded',
    })

    const destination = path.join(directory, 'extracted')
    await pipeline(host.archive.pack(directory, {entries: ['example.txt']}), host.archive.extract(destination))

    await expect(fs.readFile(path.join(destination, 'example.txt'), 'utf8')).resolves.toBe('example')
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

  expect(host.fs.existsSync('/example.txt')).toBe(true)
  expect(host.fs.existsSync('/missing.txt')).toBe(false)
  await expect(host.fs.promises.readFile('/example.txt', 'utf8')).resolves.toBe('example')
  await expect(host.loadModule<{value: string}>('/example.mjs')).resolves.toMatchObject({
    value: 'loaded',
  })
})

test('VirtualHost creates an empty writable filesystem by default', async () => {
  const host = VirtualHost.create()

  await host.fs.promises.writeFile('/example.txt', 'example')

  expect(host.vol.readFileSync('/example.txt', 'utf8')).toBe('example')
})

test('VirtualHost archives read and write only their own filesystem', async () => {
  const source = VirtualHost.create({
    '/source/nested/example.txt': 'Source contents',
  })
  const destination = VirtualHost.create({
    '/source/nested/example.txt': 'Destination contents',
  })
  const binary = Buffer.from([0, 255, 128, 1])
  await source.fs.promises.writeFile('/source/binary', binary)
  await source.fs.promises.symlink('nested/example.txt', '/source/link')

  await pipeline(source.archive.pack('/source'), destination.archive.extract('/extracted'))

  await expect(destination.fs.promises.readFile('/extracted/nested/example.txt', 'utf8')).resolves.toBe(
    'Source contents',
  )
  await expect(destination.fs.promises.readFile('/extracted/binary')).resolves.toEqual(binary)
  await expect(destination.fs.promises.readlink('/extracted/link')).resolves.toBe('nested/example.txt')
  await expect(destination.fs.promises.readFile('/source/nested/example.txt', 'utf8')).resolves.toBe(
    'Destination contents',
  )
  expect(source.fs.existsSync('/extracted')).toBe(false)
})
