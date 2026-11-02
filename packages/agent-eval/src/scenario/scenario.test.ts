import {afterEach, expect, test, vi} from 'vitest'
import {DefaultHost, VirtualHost} from '../host'
import {VirtualSandbox, type RunOptions, type Sandbox} from '../sandbox'
import {getScenario} from './get'
import {listScenarios} from './list'
import {defaultScenarioSetup} from './scenario'

function createRecordingSandbox(packageJson: string) {
  const host = VirtualHost.create({
    '/home/sandbox/workspace/package.json': packageJson,
  })
  const sandbox: Sandbox = new VirtualSandbox(host)
  const commands: Array<{command: string; args: Array<string>; options?: RunOptions}> = []

  vi.spyOn(sandbox, 'runCommand').mockImplementation(async (command, args = [], options) => {
    commands.push({command, args, options})
    return {stdout: '', stderr: '', exitCode: 0}
  })

  return {sandbox, commands}
}

afterEach(() => {
  vi.restoreAllMocks()
})

function createHost() {
  return VirtualHost.create({
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {prompt: "Create a page", description: "Example"}',
    '/scenarios/example/scenario.test.ts': '',
  })
}

test('getScenario and listScenarios accept an options object with an injected host', async () => {
  const host = createHost()
  const expected = {
    id: '2770381665',
    directory: '/scenarios/example',
    prompt: 'Create a page',
    description: 'Example',
    tags: [],
    checks: [],
    judges: [],
    image: {
      type: 'Default',
    },
    setup: defaultScenarioSetup,
  }

  await expect(getScenario({host, directory: '/scenarios', name: 'example'})).resolves.toEqual(expected)
  await expect(listScenarios({host, directory: '/scenarios'})).resolves.toEqual([expected])
})

test('getScenario and listScenarios use DefaultHost when host is omitted', async () => {
  const host = createHost()
  vi.spyOn(DefaultHost.fs, 'existsSync').mockImplementation(host.fs.existsSync)
  vi.spyOn(DefaultHost.fs.promises, 'stat').mockImplementation(host.fs.promises.stat)
  vi.spyOn(DefaultHost.fs.promises, 'readdir').mockImplementation(host.fs.promises.readdir)
  vi.spyOn(DefaultHost.fs.promises, 'readFile').mockImplementation(host.fs.promises.readFile)
  const loadModule = vi.spyOn(DefaultHost, 'loadModule').mockImplementation(host.loadModule.bind(host))

  await expect(getScenario({directory: '/scenarios', name: 'example'})).resolves.toMatchObject({id: '2770381665'})
  await expect(listScenarios({directory: '/scenarios'})).resolves.toMatchObject([{id: '2770381665'}])
  expect(loadModule).toHaveBeenCalledWith('/scenarios/example/scenario.config.ts')
})

test('getScenario reports a missing name with the supplied directory', async () => {
  await expect(getScenario({host: createHost(), directory: '/scenarios', name: 'missing'})).rejects.toThrow(
    'Scenario "missing" was not found in: /scenarios',
  )
})

test('getScenario accepts both the directory locator and an explicit config ID', async () => {
  const host = VirtualHost.create({
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {id: "pinned", prompt: "Create a page"}',
  })

  for (const name of ['example', 'pinned']) {
    const scenario = await getScenario({host, directory: '/scenarios', name})

    expect(scenario.id).toBe('pinned')
  }
})

test('getScenario prioritizes resolved IDs over another resource directory', async () => {
  const host = VirtualHost.create({
    '/scenarios/original/package.json': '{}',
    '/scenarios/original/scenario.config.ts': 'export default {id: "other", prompt: "Original"}',
    '/scenarios/other/package.json': '{}',
    '/scenarios/other/scenario.config.ts': 'export default {id: "different", prompt: "Other"}',
  })

  const scenario = await getScenario({host, directory: '/scenarios', name: 'other'})

  expect(scenario.directory).toBe('/scenarios/original')
})

test('defaultScenarioSetup uses npm when no package manager is configured', async () => {
  const {sandbox, commands} = createRecordingSandbox(JSON.stringify({scripts: {build: 'tsc'}}))

  await defaultScenarioSetup({sandbox})

  expect(commands.slice(-2).map(({command, args}) => ({command, args}))).toEqual([
    {command: 'npm', args: ['install']},
    {command: 'npm', args: ['run', 'build']},
  ])
})

test.each(['pnpm@10.1.0', 'yarn@4.6.0'])(
  'default scenario setup uses Corepack for the configured %s package manager',
  async packageManager => {
    const {sandbox, commands} = createRecordingSandbox(
      JSON.stringify({
        packageManager,
        scripts: {build: 'tsc'},
      }),
    )

    await defaultScenarioSetup({sandbox})

    expect(commands.slice(-2)).toEqual([
      expect.objectContaining({
        command: 'corepack',
        args: [packageManager, 'install'],
        options: expect.objectContaining({env: {COREPACK_ENABLE_DOWNLOAD_PROMPT: '0'}}),
      }),
      expect.objectContaining({
        command: 'corepack',
        args: [packageManager, 'run', 'build'],
        options: expect.objectContaining({env: {COREPACK_ENABLE_DOWNLOAD_PROMPT: '0'}}),
      }),
    ])
  },
)

test('defaultScenarioSetup skips the build when the package has no build script', async () => {
  const {sandbox, commands} = createRecordingSandbox('{}')

  await defaultScenarioSetup({sandbox})

  expect(commands.at(-1)).toMatchObject({command: 'npm', args: ['install']})
})
