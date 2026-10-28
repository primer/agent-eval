import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {expect, test} from 'vitest'
import {DefaultHost, SystemHost, VirtualHost} from './host'

test('SystemHost provides access to the system filesystem and module loader', async () => {
  const moduleFilepath = path.join(import.meta.dirname, 'fixtures/host/example.mjs')
  const host = await SystemHost.create()

  expect(host.fs.existsSync(moduleFilepath)).toBe(true)
  expect(host.fs.existsSync(path.join(import.meta.dirname, 'fixtures/host/missing.mjs'))).toBe(false)
  await expect(host.fs.promises.readFile(moduleFilepath, 'utf8')).resolves.toBe("export const value = 'loaded'\n")
  await expect(host.loadModule<{value: string}>(moduleFilepath)).resolves.toMatchObject({
    value: 'loaded',
  })
  await expect(host.loadModule<{value: string}>(pathToFileURL(moduleFilepath).href)).resolves.toMatchObject({
    value: 'loaded',
  })
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
