import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {pipeline} from 'node:stream/promises'
import tarStream from 'tar-stream'
import {afterEach, describe, expect, test, vi} from 'vitest'
import {CUSTOM_AGENTS_DIR, SKILLS_DIR, Sandbox} from './index'

const temporaryDirectories: Array<string> = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => fs.rm(directory, {force: true, recursive: true})))
  vi.restoreAllMocks()
})

describe('Sandbox.copyDirectoryContents', () => {
  test('copies the contents of a directory without its root directory', async () => {
    const source = await createTemporaryDirectory()
    await fs.mkdir(path.join(source, 'nested'))
    await fs.writeFile(path.join(source, 'reference.md'), 'Reference')
    await fs.writeFile(path.join(source, 'nested', 'context.md'), 'Context')

    const copiedFiles = new Map<string, string>()
    const copiedOwnership = new Map<string, {gid?: number; uid?: number}>()
    const putArchive = vi.fn(async (archive: NodeJS.ReadableStream) => {
      const extract = tarStream.extract()
      extract.on('entry', (header, stream, next) => {
        const chunks: Array<Buffer> = []
        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('end', () => {
          if (header.type === 'file') {
            copiedFiles.set(header.name, Buffer.concat(chunks).toString('utf8'))
            copiedOwnership.set(header.name, {gid: header.gid, uid: header.uid})
          }
          next()
        })
        stream.resume()
      })
      await pipeline(archive, extract)
    })
    const sandbox = new Sandbox({} as never, {putArchive} as never)
    vi.spyOn(sandbox, 'runCommand').mockResolvedValue({exitCode: 0, stderr: '', stdout: ''})

    await sandbox.copyDirectoryContents(source, '/destination')

    expect(sandbox.runCommand).toHaveBeenCalledWith('mkdir', ['-p', '/destination'])
    expect(putArchive).toHaveBeenCalledWith(expect.anything(), {path: '/destination'})
    expect(copiedFiles).toEqual(
      new Map([
        ['nested/context.md', 'Context'],
        ['reference.md', 'Reference'],
      ]),
    )
    expect(copiedOwnership).toEqual(
      new Map([
        ['nested/context.md', {gid: 1000, uid: 1000}],
        ['reference.md', {gid: 1000, uid: 1000}],
      ]),
    )
  })

  test('creates the destination for an empty directory', async () => {
    const source = await createTemporaryDirectory()
    const putArchive = vi.fn()
    const sandbox = new Sandbox({} as never, {putArchive} as never)
    vi.spyOn(sandbox, 'runCommand').mockResolvedValue({exitCode: 0, stderr: '', stdout: ''})

    await sandbox.copyDirectoryContents(source, '/destination')

    expect(sandbox.runCommand).toHaveBeenCalledWith('mkdir', ['-p', '/destination'])
    expect(putArchive).not.toHaveBeenCalled()
  })

  test('rejects a source that is not a directory', async () => {
    const source = path.join(await createTemporaryDirectory(), 'reference.md')
    await fs.writeFile(source, 'Reference')
    const sandbox = new Sandbox({} as never, {} as never)

    await expect(sandbox.copyDirectoryContents(source, '/destination')).rejects.toThrow(
      `Cannot copy contents of "${source}" because it is not a directory`,
    )
  })
})

describe('Sandbox directory options', () => {
  test('adds directory contents to an agent skill', async () => {
    const sandbox = createMockSandbox()

    await sandbox.addAgentSkill('test-planning', 'Plans tests', 'Create test plans.', {
      directories: [{sourcePath: './test-planning'}],
    })

    expect(sandbox.copyDirectoryContents).toHaveBeenCalledWith(
      './test-planning',
      path.posix.join(SKILLS_DIR, 'test-planning'),
    )
  })

  test('adds directory contents to a custom agent directory', async () => {
    const sandbox = createMockSandbox()

    await sandbox.addCustomAgent('test-specialist', 'Tests code', 'Write tests.', {
      directories: [{sourcePath: './test-specialist'}],
    })

    expect(sandbox.copyDirectoryContents).toHaveBeenCalledWith(
      './test-specialist',
      path.posix.join(CUSTOM_AGENTS_DIR, 'test-specialist'),
    )
  })

  test('rejects directory destinations outside the configured directory', async () => {
    const sandbox = createMockSandbox()

    await expect(
      sandbox.addAgentSkill('test-planning', 'Plans tests', 'Create test plans.', {
        directories: [{sourcePath: './test-planning', destinationPath: '../outside'}],
      }),
    ).rejects.toThrow('Invalid agent skill directory destination "../outside"')
  })
})

async function createTemporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-sandbox-'))
  temporaryDirectories.push(directory)
  return directory
}

function createMockSandbox(): Sandbox {
  const sandbox = new Sandbox({} as never, {} as never)
  vi.spyOn(sandbox, 'exists').mockResolvedValue(false)
  vi.spyOn(sandbox, 'runCommand').mockResolvedValue({exitCode: 0, stderr: '', stdout: ''})
  vi.spyOn(sandbox, 'writeFile').mockResolvedValue()
  vi.spyOn(sandbox, 'copyDirectoryContents').mockResolvedValue()
  return sandbox
}
