import {execFile} from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {promisify} from 'node:util'
import type {GlobOptions, Path} from 'glob'
import {afterEach, beforeEach, describe, expect, expectTypeOf, test, vi} from 'vitest'
import type {RunningContainer} from '../docker'
import {DefaultHost, VirtualHost} from '../host'
import {CONTAINER_WORKDIR} from './constants'
import {createSandboxGlob} from './glob'
import {createContainerGlobFileSystem} from './glob-fs'
import {SystemSandbox} from './system'
import type {Sandbox} from './types'
import {VirtualSandbox} from './virtual'

const execFileAsync = promisify(execFile)

describe.each(['virtual', 'container'] as const)('sandbox.glob (%s filesystem)', runtime => {
  let sandbox: Sandbox
  let cwd: string
  let filesystem: typeof fs

  beforeEach(async () => {
    if (runtime === 'virtual') {
      const host = VirtualHost.create()
      sandbox = await VirtualSandbox.create({host})
      cwd = CONTAINER_WORKDIR
      filesystem = host.fs
    } else {
      cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-glob-'))
      filesystem = fs
      sandbox = new SystemSandbox(DefaultHost, {} as RunningContainer)
      // Exercise the actual container filesystem script without requiring Docker in unit tests.
      vi.spyOn(sandbox, 'runCommand').mockImplementation(async (command, args) => {
        expect(command).toBe('/opt/agent-eval/node/bin/node')
        const result = await execFileAsync(process.execPath, args)
        return {...result, exitCode: 0}
      })
    }

    await filesystem.mkdir(path.join(cwd, 'src/nested'), {recursive: true})
    await filesystem.writeFile(path.join(cwd, 'src/index.ts'), 'export {}')
    await filesystem.writeFile(path.join(cwd, 'src/nested/test.ts'), 'test')
    await filesystem.writeFile(path.join(cwd, 'src/.hidden.ts'), 'hidden')
    await filesystem.writeFile(path.join(cwd, 'README.md'), 'readme')
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    if (runtime === 'container') {
      await fs.rm(cwd, {recursive: true, force: true})
    }
  })

  test('matches recursive patterns and multiple patterns without duplicates', async () => {
    const matches = await sandbox.glob(['**/*.ts', 'src/index.ts', '*.md'], {cwd})
    expectTypeOf(matches).toEqualTypeOf<Array<string>>()
    expect(matches.sort()).toEqual(['README.md', 'src/index.ts', 'src/nested/test.ts'])
    expect(await sandbox.glob('**/*.{ts,md}', {cwd})).toEqual(expect.arrayContaining(matches))
  })

  test('supports ignore, dot, nodir, and absolute results', async () => {
    expect(
      (await sandbox.glob('**/*', {cwd, dot: true, nodir: true, ignore: ['**/nested/**'], absolute: true})).sort(),
    ).toEqual(['README.md', 'src/.hidden.ts', 'src/index.ts'].map(name => path.join(cwd, name)))
  })

  test('supports file URL cwd, absolute patterns, and no matches', async () => {
    expect(await sandbox.glob('index.ts', {cwd: pathToFileURL(path.join(cwd, 'src'))})).toEqual(['index.ts'])
    expect(await sandbox.glob('index.ts', {cwd: pathToFileURL(path.join(cwd, 'src')).href})).toEqual(['index.ts'])
    expect(await sandbox.glob(`${cwd}/src/*.ts`)).toEqual([`${cwd}/src/index.ts`])
    expect(await sandbox.glob('**/*.missing', {cwd})).toEqual([])
    expect(await sandbox.glob('**/*', {cwd: path.join(cwd, 'missing')})).toEqual([])
  })

  test('returns Path objects and stat metadata with withFileTypes', async () => {
    const matches = await sandbox.glob('src/index.ts', {cwd, withFileTypes: true, stat: true})
    expectTypeOf(matches).toEqualTypeOf<Array<Path>>()
    expect(matches).toHaveLength(1)
    expect(matches[0]!.fullpath()).toBe(path.join(cwd, 'src/index.ts'))
    expect(matches[0]!.isFile()).toBe(true)
    expect(matches[0]!.size).toBe(9)

    const options: GlobOptions = {cwd, withFileTypes: false}
    expectTypeOf(sandbox.glob('*', options)).toEqualTypeOf<Promise<Array<Path> | Array<string>>>()
    expectTypeOf(sandbox.glob('*', {cwd, withFileTypes: false})).toEqualTypeOf<Promise<Array<string>>>()
  })

  test('supports callback-based ignore options', async () => {
    expect(await sandbox.glob('**/*.ts', {cwd, ignore: {ignored: entry => entry.name === 'test.ts'}})).toEqual([
      'src/index.ts',
    ])
  })

  test('follows symlinks and resolves real paths inside the sandbox filesystem', async () => {
    await filesystem.symlink('src', path.join(cwd, 'linked'))
    expect((await sandbox.glob('linked/**/*.ts', {cwd, follow: true, realpath: true})).sort()).toEqual([
      'src/index.ts',
      'src/nested/test.ts',
    ])
  })

  test('passes special characters in filenames as data', async () => {
    const name = 'a "quote"; $(echo unsafe)\nfile.ts'
    await filesystem.writeFile(path.join(cwd, name), 'safe')
    expect(await sandbox.glob('*.ts', {cwd, stat: true})).toEqual([name])
  })

  test('does not cache results across calls', async () => {
    expect(await sandbox.glob('new.ts', {cwd})).toEqual([])
    await filesystem.writeFile(path.join(cwd, 'new.ts'), 'new')
    expect(await sandbox.glob('new.ts', {cwd})).toEqual(['new.ts'])
  })

  test('supports cancellation', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(sandbox.glob('**/*', {cwd, signal: controller.signal})).rejects.toMatchObject({name: 'AbortError'})
  })
})

test('defaults to the virtual workspace, resolves relative cwd, and never reads host files', async () => {
  const sandbox = await VirtualSandbox.create()
  await sandbox.writeFile('src/index.ts', '')
  expect(await sandbox.glob('**/*.ts')).toEqual(['src/index.ts'])
  expect(await sandbox.glob('*.ts', {cwd: './src'})).toEqual(['index.ts'])
  expect(await sandbox.glob(`${process.cwd()}/package.json`)).toEqual([])
})

test('rejects Docker transport failures instead of returning no matches', async () => {
  const cause = new Error('Docker daemon disconnected')
  const glob = createSandboxGlob(
    createContainerGlobFileSystem(async () => {
      throw cause
    }),
  )
  await expect(glob('**/*.ts')).rejects.toMatchObject({cause})
})

test.each(['not json', '{}', '{"value":null}'])('rejects invalid container responses: %s', async stdout => {
  const glob = createSandboxGlob(createContainerGlobFileSystem(async () => ({stdout, stderr: '', exitCode: 0})))
  await expect(glob('**/*.ts')).rejects.toThrow()
})

test('preserves filesystem error codes from the container', async () => {
  const fs = createContainerGlobFileSystem(async () => ({
    stdout: JSON.stringify({error: {message: 'No such file', code: 'ENOENT'}}),
    stderr: '',
    exitCode: 0,
  }))
  await expect(fs.lstat('/missing')).rejects.toMatchObject({code: 'ENOENT'})
})
