import path from 'node:path'
import {PassThrough, Readable} from 'node:stream'
import {pipeline} from 'node:stream/promises'
import Docker from 'dockerode'
import {afterEach, expect, test, vi} from 'vitest'
import * as docker from '../docker'
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
  const running = await docker.createContainer({image: {tagName: 'test'}})

  return {
    container,
    sandbox: new SystemSandbox(host, running),
  }
}

test('copy and download use host archives while preserving renaming and exclusions', async () => {
  const sourcePath = path.resolve('archive-source')
  const host = VirtualHost.create({
    [sourcePath]: {
      'example.txt': 'Example',
      nested: {'included.txt': 'Included', 'ignored.txt': 'Ignored on download'},
      excluded: {'secret.txt': 'Excluded on copy'},
    },
  })
  const containerHost = VirtualHost.create()
  const {container, sandbox} = await createSandbox(host)
  await using resource = sandbox
  vi.spyOn(docker, 'exec').mockResolvedValue({
    stdout: '',
    stderr: '',
    exitCode: 0,
  })
  vi.spyOn(container, 'putArchive').mockImplementation(async stream => {
    if (typeof stream === 'string' || Buffer.isBuffer(stream)) {
      throw new TypeError('Expected an archive stream')
    }
    await pipeline(stream, containerHost.archive.extract('/container'))
    return new PassThrough()
  })
  vi.spyOn(container, 'getArchive').mockImplementation(async () => {
    return containerHost.archive.pack('/container', {entries: ['renamed']})
  })

  await resource.copy(sourcePath, 'renamed', {exclude: ['excluded']})
  await resource.download('renamed', '/downloaded', {
    ignore(filepath) {
      return path.basename(filepath) === 'ignored.txt'
    },
  })

  await expect(containerHost.fs.promises.readFile('/container/renamed/example.txt', 'utf8')).resolves.toBe('Example')
  expect(containerHost.fs.existsSync('/container/renamed/excluded')).toBe(false)
  await expect(host.fs.promises.readFile('/downloaded/example.txt', 'utf8')).resolves.toBe('Example')
  await expect(host.fs.promises.readFile('/downloaded/nested/included.txt', 'utf8')).resolves.toBe('Included')
  expect(host.fs.existsSync('/downloaded/nested/ignored.txt')).toBe(false)
  expect(host.fs.existsSync('/downloaded/excluded')).toBe(false)
})

test.each([
  {label: 'empty include', include: [], expected: []},
  {label: 'file paths', include: ['README.md'], expected: ['README.md']},
  {label: 'nested file paths', include: ['skills/SKILL.md'], expected: ['skills', 'skills/SKILL.md']},
  {
    label: 'directories',
    include: ['skills/'],
    expected: ['skills', 'skills/SKILL.md', 'skills/draft.tmp', 'skills/references', 'skills/references/guide.md'],
  },
  {
    label: 'wildcards and dotfiles',
    include: ['**/*.md'],
    expected: [
      '.cache',
      '.cache/cached.md',
      'README.md',
      'skills',
      'skills/SKILL.md',
      'skills/references',
      'skills/references/guide.md',
    ],
  },
  {
    label: 'multiple patterns',
    include: ['README.md', 'skills/*.tmp'],
    expected: ['README.md', 'skills', 'skills/draft.tmp'],
  },
  {label: 'empty directories', include: ['empty'], expected: ['empty']},
  {label: 'unmatched patterns', include: ['missing/**'], expected: []},
  {label: 'case-sensitive patterns', include: ['readme.md'], expected: []},
  {label: 'paths outside the source', include: ['../outside.md'], expected: []},
  {
    label: 'ignored files and directories',
    include: ['skills'],
    ignore: ['**/*.tmp', 'skills/references'],
    expected: ['skills', 'skills/SKILL.md'],
  },
  {label: 'ignored ancestors', include: ['skills/SKILL.md'], ignore: ['skills'], expected: []},
])('addCopilotPlugin includes only selected local paths with $label', async ({include, ignore, expected}) => {
  const sourcePath = path.resolve('plugin')
  const host = VirtualHost.create({
    [sourcePath]: {
      'README.md': 'Plugin',
      'notes.tmp': 'Temporary',
      '.cache': {'cached.md': 'Cached'},
      empty: {},
      skills: {'SKILL.md': 'Skill', 'draft.tmp': 'Draft', references: {'guide.md': 'Guide'}},
      'skills-other': {'unselected.txt': 'Unselected'},
    },
    [path.resolve('outside.md')]: 'Outside',
  })
  const {sandbox} = await createSandbox(host)
  await using resource = sandbox
  await using files = await VirtualSandbox.create({host})
  const copy = vi.spyOn(resource, 'copy').mockImplementation((...args) => files.copy(...args))
  const runCommand = vi.spyOn(resource, 'runCommand').mockResolvedValue({stdout: '', stderr: '', exitCode: 0})

  await resource.addCopilotPlugin({type: 'local', sourcePath, include, ignore})

  const destination = copy.mock.calls[0]![1]
  expect((await files.glob('**/*', {cwd: destination, dot: true})).sort()).toEqual(expected)
  expect(await files.exists(destination)).toBe(true)
  expect(runCommand).toHaveBeenCalledWith('/opt/agent-eval/copilot/bin/copilot', ['plugin', 'install', destination])
  expect(await host.fs.promises.readFile(path.join(sourcePath, 'notes.tmp'), 'utf8')).toBe('Temporary')
})

test.each([
  {label: 'relative source', sourcePath: 'plugin', include: ['.']},
  {label: 'absolute source', sourcePath: path.resolve('plugin'), include: ['.']},
  {label: 'absolute include', sourcePath: 'plugin', include: [path.resolve('plugin')]},
])('addCopilotPlugin can include the entire local source with $label', async ({sourcePath, include}) => {
  const host = VirtualHost.create({
    [path.resolve('plugin')]: {'README.md': 'Plugin', skills: {'SKILL.md': 'Skill'}},
  })
  const {sandbox} = await createSandbox(host)
  await using resource = sandbox
  await using files = await VirtualSandbox.create({host})
  const copy = vi.spyOn(resource, 'copy').mockImplementation((...args) => files.copy(...args))
  vi.spyOn(resource, 'runCommand').mockResolvedValue({stdout: '', stderr: '', exitCode: 0})

  await resource.addCopilotPlugin({type: 'local', sourcePath, include})

  const destination = copy.mock.calls[0]![1]
  expect((await files.glob('**/*', {cwd: destination})).sort()).toEqual(['README.md', 'skills', 'skills/SKILL.md'])
})

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
  expect(runCommand).toHaveBeenCalledWith('/opt/agent-eval/copilot/bin/copilot', ['plugin', 'install', destination])
  expect(await host.fs.promises.readFile(path.join(sourcePath, 'notes.tmp'), 'utf8')).toBe('Temporary')
})

test('addCopilotPlugin filters local marketplace sources before registering them', async () => {
  const sourcePath = '/marketplace'
  const host = VirtualHost.create({
    [sourcePath]: {
      'marketplace.json': '{}',
      'README.md': 'Marketplace',
      plugins: {'plugin.json': '{}', 'draft.tmp': 'Draft'},
      node_modules: {'dependency.js': 'Dependency'},
    },
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
      source: {type: 'local', sourcePath, include: ['marketplace.json', 'plugins'], ignore: ['**/*.tmp']},
    },
  })

  const destination = copy.mock.calls[0]![1]
  expect((await files.glob('**/*', {cwd: destination})).sort()).toEqual([
    'marketplace.json',
    'plugins',
    'plugins/plugin.json',
  ])
  expect(runCommand.mock.calls).toEqual([
    ['/opt/agent-eval/copilot/bin/copilot', ['plugin', 'marketplace', 'add', destination]],
    ['/opt/agent-eval/copilot/bin/copilot', ['plugin', 'install', 'plugin@marketplace']],
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
  expect(runCommand).toHaveBeenCalledWith('/opt/agent-eval/copilot/bin/copilot', ['plugin', 'install', expected])
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
