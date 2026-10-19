import path from 'node:path'
import {PassThrough, Readable} from 'node:stream'
import Docker from 'dockerode'
import {afterEach, expect, test, vi} from 'vitest'
import {createContainer} from '../docker'
import {VirtualHost} from '../host'
import {SystemSandbox} from './system'
import {VirtualSandbox} from './virtual'
import type {LocalCopilotPluginSource} from './types'

afterEach(() => {
  vi.restoreAllMocks()
})

async function createSandbox(host = VirtualHost.create()) {
  const container = new Docker().getContainer('test')
  vi.spyOn(Docker.prototype, 'createContainer').mockResolvedValue(container)
  vi.spyOn(container, 'start').mockResolvedValue(undefined)
  vi.spyOn(container, 'remove').mockResolvedValue(undefined)
  const running = await createContainer({image: {tagName: 'test'}})

  return {
    container,
    sandbox: new SystemSandbox(host, running),
  }
}

test.each([
  {label: 'omitted ignore', ignore: undefined, expected: ['.cache', 'README.md', 'notes.tmp', 'skills']},
  {label: 'empty ignore', ignore: [], expected: ['.cache', 'README.md', 'notes.tmp', 'skills']},
  {label: 'file paths', ignore: ['README.md'], expected: ['.cache', 'notes.tmp', 'skills']},
  {label: 'directories', ignore: ['skills/'], expected: ['.cache', 'README.md', 'notes.tmp']},
  {label: 'wildcards and dotfiles', ignore: ['**/*.tmp'], expected: ['.cache', 'README.md', 'skills']},
  {label: 'multiple patterns', ignore: ['.cache', '*.tmp', 'README.md'], expected: ['skills']},
  {label: 'unmatched patterns', ignore: ['missing/**'], expected: ['.cache', 'README.md', 'notes.tmp', 'skills']},
])('addCopilotPlugin copies local sources with $label', async ({ignore, expected}) => {
  const sourcePath = path.resolve('plugin')
  const host = VirtualHost.create({
    [sourcePath]: {
      'README.md': 'Plugin',
      'notes.tmp': 'Temporary',
      '.cache': {'cached.tmp': 'Cached'},
      skills: {'SKILL.md': 'Skill', 'draft.tmp': 'Draft'},
    },
  })
  const {sandbox} = await createSandbox(host)
  await using resource = sandbox
  await using files = await VirtualSandbox.create({host})
  const copy = vi.spyOn(resource, 'copy').mockImplementation((...args) => files.copy(...args))
  const runCommand = vi.spyOn(resource, 'runCommand').mockResolvedValue({stdout: '', stderr: '', exitCode: 0})
  const source: LocalCopilotPluginSource = {type: 'local', sourcePath: 'plugin', ignore}

  await resource.addCopilotPlugin(source)

  const destination = copy.mock.calls[0]![1]
  expect((await files.readdir(destination)).sort()).toEqual(expected)
  expect(await files.exists(path.posix.join(destination, 'skills/SKILL.md'))).toBe(expected.includes('skills'))
  if (ignore?.includes('**/*.tmp')) {
    expect(await files.exists(path.posix.join(destination, 'skills/draft.tmp'))).toBe(false)
    expect(await files.exists(path.posix.join(destination, '.cache/cached.tmp'))).toBe(false)
  }
  expect(runCommand).toHaveBeenCalledWith('copilot', ['plugin', 'install', destination])
  expect(await host.fs.promises.readFile(path.join(sourcePath, 'notes.tmp'), 'utf8')).toBe('Temporary')
})

test('addCopilotPlugin filters local marketplace sources before registering them', async () => {
  const sourcePath = '/marketplace'
  const host = VirtualHost.create({
    [sourcePath]: {'marketplace.json': '{}', node_modules: {'dependency.js': 'Dependency'}},
  })
  const {sandbox} = await createSandbox(host)
  await using resource = sandbox
  await using files = await VirtualSandbox.create({host})
  const copy = vi.spyOn(resource, 'copy').mockImplementation((...args) => files.copy(...args))
  const runCommand = vi.spyOn(resource, 'runCommand').mockResolvedValue({stdout: '', stderr: '', exitCode: 0})

  await resource.addCopilotPlugin({
    type: 'marketplace',
    name: 'plugin',
    marketplace: {
      name: 'marketplace',
      source: {type: 'local', sourcePath, ignore: ['node_modules']},
    },
  })

  const destination = copy.mock.calls[0]![1]
  expect(await files.readdir(destination)).toEqual(['marketplace.json'])
  expect(runCommand.mock.calls).toEqual([
    ['copilot', ['plugin', 'marketplace', 'add', destination]],
    ['copilot', ['plugin', 'install', 'plugin@marketplace']],
  ])
})

test.each([
  {version: undefined, expected: 'https://github.com/example/plugin.git'},
  {version: 'v1.0.0', expected: 'https://github.com/example/plugin.git#v1.0.0'},
])('addCopilotPlugin preserves remote installation with version $version', async ({version, expected}) => {
  const {sandbox} = await createSandbox()
  await using resource = sandbox
  const copy = vi.spyOn(resource, 'copy')
  const runCommand = vi.spyOn(resource, 'runCommand').mockResolvedValue({stdout: '', stderr: '', exitCode: 0})

  await resource.addCopilotPlugin({type: 'remote', url: 'https://github.com/example/plugin.git', version})

  expect(copy).not.toHaveBeenCalled()
  expect(runCommand).toHaveBeenCalledWith('copilot', ['plugin', 'install', expected])
})

test.each([
  {label: 'empty', contents: ''},
  {label: 'small', contents: 'hello\n'},
  {label: 'large', contents: 'a'.repeat(256 * 1024)},
])('round trips $label files through Docker archive streams', async ({contents}) => {
  const {container, sandbox} = await createSandbox()
  await using resource = sandbox
  let archive: Buffer
  vi.spyOn(container, 'putArchive').mockImplementation(async stream => {
    if (!(stream instanceof Readable)) {
      throw new TypeError('Expected a Node readable stream')
    }
    expect(stream.readableObjectMode).toBe(false)
    archive = Buffer.concat(await stream.toArray())
    return new PassThrough()
  })
  vi.spyOn(container, 'getArchive').mockImplementation(async () => {
    return Readable.from([archive])
  })

  await resource.writeFile('example.txt', contents)

  await expect(resource.readFile('example.txt')).resolves.toBe(contents)
})

test('rejects malformed archives', async () => {
  const {container, sandbox} = await createSandbox()
  await using resource = sandbox
  vi.spyOn(container, 'getArchive').mockResolvedValue(Readable.from([Buffer.from('invalid tar archive')]))

  await expect(resource.readFile('example.txt')).rejects.toThrow('Unexpected end of data')
})

test('propagates archive source errors', async () => {
  const {container, sandbox} = await createSandbox()
  await using resource = sandbox
  const error = new Error('Archive download failed')
  vi.spyOn(container, 'getArchive').mockResolvedValue(
    new Readable({
      read() {
        this.destroy(error)
      },
    }),
  )

  await expect(resource.readFile('example.txt')).rejects.toThrow(error)
})
