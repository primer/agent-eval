import path from 'node:path'
import {describe, expect, test} from 'vitest'
import {VirtualHost} from '../host'
import {CONTAINER_WORKDIR} from './constants'
import {VirtualSandbox} from './virtual'

describe('VirtualSandbox', () => {
  test('reads, writes, and checks files in the sandbox workspace', async () => {
    const host = VirtualHost.create()
    const sandbox = await VirtualSandbox.create({host})

    expect(await sandbox.exists('nested/example.txt')).toBe(false)

    await sandbox.writeFile('nested/example.txt', 'example')

    expect(await sandbox.exists('nested/example.txt')).toBe(true)
    expect(await sandbox.readFile('nested/example.txt')).toBe('example')
    expect(await host.fs.readFile(path.join(CONTAINER_WORKDIR, 'nested/example.txt'), 'utf8')).toBe('example')
  })

  test('resolves absolute and relative container paths', async () => {
    const host = VirtualHost.create({
      '/absolute/example.txt': 'absolute',
      [CONTAINER_WORKDIR]: {
        'relative.txt': 'relative',
      },
    })
    const sandbox = await VirtualSandbox.create({host})

    expect(await sandbox.readFile('/absolute/../absolute/example.txt')).toBe('absolute')
    expect(await sandbox.readFile('./nested/../relative.txt')).toBe('relative')
    expect(await sandbox.exists('/absolute/example.txt')).toBe(true)
  })

  test('copies host directories into the sandbox with exclusions', async () => {
    const host = VirtualHost.create({
      '/fixture/included.txt': 'included',
      '/fixture/nested/included.txt': 'nested',
      '/fixture/nested/excluded.txt': 'excluded',
    })
    const sandbox = await VirtualSandbox.create({host})

    await sandbox.copy('/fixture', 'copied', {
      exclude: ['nested/excluded.txt'],
    })

    expect(await sandbox.readFile('copied/included.txt')).toBe('included')
    expect(await sandbox.readFile('copied/nested/included.txt')).toBe('nested')
    expect(await sandbox.exists('copied/nested/excluded.txt')).toBe(false)
  })

  test('downloads sandbox directories to the host with ignored files', async () => {
    const host = VirtualHost.create()
    const sandbox = await VirtualSandbox.create({host})

    await sandbox.writeFile('results/included.txt', 'included')
    await sandbox.writeFile('results/nested/included.txt', 'nested')
    await sandbox.writeFile('results/nested/ignored.txt', 'ignored')

    await sandbox.download('results', '/download', {
      ignore(name) {
        return name.endsWith('ignored.txt')
      },
    })

    expect(await host.fs.readFile('/download/included.txt', 'utf8')).toBe('included')
    expect(await host.fs.readFile('/download/nested/included.txt', 'utf8')).toBe('nested')
    await expect(host.fs.access('/download/nested/ignored.txt')).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  test('downloads relative container files from the sandbox workspace', async () => {
    const host = VirtualHost.create({
      [CONTAINER_WORKDIR]: {
        'result.txt': 'result',
      },
    })
    const sandbox = await VirtualSandbox.create({host})

    await sandbox.download('./nested/../result.txt', '/download')

    expect(await host.fs.readFile('/download/result.txt', 'utf8')).toBe('result')
  })
})
