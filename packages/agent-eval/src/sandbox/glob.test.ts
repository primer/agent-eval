import {describe, expect, test} from 'vitest'
import {VirtualHost} from '../host'
import {CONTAINER_WORKDIR} from './constants'
import {VirtualSandbox} from './virtual'

describe('VirtualSandbox.glob', () => {
  function createHost() {
    return VirtualHost.create({
      [CONTAINER_WORKDIR]: {
        'src/index.ts': '',
        'src/nested/component.ts': '',
        'src/nested/style.css': '',
        'src/.hidden.ts': '',
        'tests/index.test.ts': '',
        'README.md': '',
      },
      '/outside/other.ts': '',
    })
  }

  test('matches recursive patterns in the sandbox workspace without options', async () => {
    await using sandbox = await VirtualSandbox.create({host: createHost()})

    const matches = await sandbox.glob('src/**/*.ts')

    expect(matches.sort()).toEqual(['src/index.ts', 'src/nested/component.ts'])
  })

  test('combines multiple patterns without duplicate results', async () => {
    await using sandbox = await VirtualSandbox.create({host: createHost()})

    const matches = await sandbox.glob(['src/**/*.ts', '**/index.ts', 'tests/**/*.ts'])

    expect(matches.sort()).toEqual(['src/index.ts', 'src/nested/component.ts', 'tests/index.test.ts'])
  })

  test.each([
    {name: 'workspace-relative', cwd: 'src'},
    {name: 'absolute', cwd: `${CONTAINER_WORKDIR}/src`},
    {name: 'file URL', cwd: new URL(`file://${CONTAINER_WORKDIR}/src`)},
  ])('resolves a $name working directory inside the sandbox', async ({cwd}) => {
    await using sandbox = await VirtualSandbox.create({host: createHost()})

    const matches = await sandbox.glob('**/*.ts', {cwd})

    expect(matches.sort()).toEqual(['index.ts', 'nested/component.ts'])
  })

  test('returns sandbox-absolute paths when requested', async () => {
    await using sandbox = await VirtualSandbox.create({host: createHost()})

    const matches = await sandbox.glob('src/**/*.ts', {absolute: true})

    expect(matches.sort()).toEqual([
      `${CONTAINER_WORKDIR}/src/index.ts`,
      `${CONTAINER_WORKDIR}/src/nested/component.ts`,
    ])
  })

  test('matches absolute patterns in the sandbox filesystem', async () => {
    await using sandbox = await VirtualSandbox.create({host: createHost()})

    await expect(sandbox.glob('/outside/*.ts')).resolves.toEqual(['/outside/other.ts'])
  })

  test('forwards options for hidden files, ignored paths, and directory filtering', async () => {
    await using sandbox = await VirtualSandbox.create({host: createHost()})

    const matches = await sandbox.glob('src/**', {
      dot: true,
      ignore: 'src/nested/**',
      nodir: true,
    })

    expect(matches.sort()).toEqual(['src/.hidden.ts', 'src/index.ts'])
  })

  test('returns an empty list when no files match', async () => {
    await using sandbox = await VirtualSandbox.create({host: createHost()})

    await expect(sandbox.glob('missing/**/*.ts')).resolves.toEqual([])
  })

  test('uses case-sensitive matching by default, regardless of the host platform', async () => {
    await using sandbox = await VirtualSandbox.create({host: createHost()})

    await expect(sandbox.glob('src/INDEX.ts')).resolves.toEqual([])
    await expect(sandbox.glob('src/INDEX.ts', {nocase: true})).resolves.toEqual(['src/index.ts'])
  })

  test('supports multiple ignore patterns', async () => {
    await using sandbox = await VirtualSandbox.create({host: createHost()})

    const matches = await sandbox.glob('src/**/*.ts', {
      ignore: ['src/index.ts', '**/*.css'],
    })

    expect(matches).toEqual(['src/nested/component.ts'])
  })

  test('follows symlinked directories when requested', async () => {
    const host = createHost()
    await host.fs.promises.symlink('/outside', `${CONTAINER_WORKDIR}/linked`)
    await using sandbox = await VirtualSandbox.create({host})

    const matches = await sandbox.glob('**/*.ts', {follow: true})

    expect(matches.sort()).toEqual([
      'linked/other.ts',
      'src/index.ts',
      'src/nested/component.ts',
      'tests/index.test.ts',
    ])
  })

  test('resolves symlink matches inside the sandbox filesystem', async () => {
    const host = createHost()
    await host.fs.promises.symlink(`${CONTAINER_WORKDIR}/src/index.ts`, `${CONTAINER_WORKDIR}/linked.ts`)
    await using sandbox = await VirtualSandbox.create({host})

    await expect(sandbox.glob('linked.ts', {realpath: true})).resolves.toEqual(['src/index.ts'])
  })
})
