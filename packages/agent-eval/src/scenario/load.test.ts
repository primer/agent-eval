import {afterEach, expect, test, vi} from 'vitest'
import {DefaultHost, VirtualHost} from '../host'
import {logger} from '../logger'
import {VirtualSandbox} from '../sandbox'
import {loadScenario} from './load'
import {defaultScenarioSetup, ScenarioSchema} from './scenario'

afterEach(() => {
  vi.restoreAllMocks()
})

function createHost(config = 'export default {prompt: "Create a page"}') {
  return VirtualHost.create({
    '/scenarios/example/scenario.config.ts': config,
  })
}

test('loadScenario selects the default image and setup without requiring a package manifest', async () => {
  const host = createHost()

  const scenario = await loadScenario({host, directory: '/scenarios/example'})

  expect(scenario).toMatchObject({
    id: 'example',
    directory: '/scenarios/example',
    prompt: 'Create a page',
    image: {type: 'Default'},
    setup: defaultScenarioSetup,
  })
})

test('loadScenario uses DefaultHost when host is omitted', async () => {
  const host = createHost()
  vi.spyOn(DefaultHost, 'existsSync').mockImplementation(host.existsSync)
  vi.spyOn(DefaultHost.fs, 'stat').mockImplementation(host.fs.stat)
  vi.spyOn(DefaultHost, 'loadModule').mockImplementation(host.loadModule.bind(host))

  const scenario = await loadScenario({directory: '/scenarios/example'})

  expect(scenario).toMatchObject({id: 'example', prompt: 'Create a page'})
})

test('loadScenario preserves metadata when an explicit name overrides the directory basename', async () => {
  const host = createHost(
    'export default {prompt: "Create a page", description: "Example", tags: ["forms", "accessibility"]}',
  )

  const scenario = await loadScenario({host, directory: '/scenarios/example', name: 'custom'})

  expect(scenario).toMatchObject({
    id: 'custom',
    directory: '/scenarios/example',
    prompt: 'Create a page',
    description: 'Example',
    tags: ['forms', 'accessibility'],
  })
})

test('loadScenario omits default setup when a custom image is configured', async () => {
  const host = createHost('export default {prompt: "Create a page", image: "node:26-slim"}')

  const scenario = await loadScenario({host, directory: '/scenarios/example'})

  expect(scenario.setup).toBeUndefined()
})

test.each([
  {name: 'the default image', image: ''},
  {name: 'a custom image', image: 'image: "node:26-slim",'},
])('loadScenario preserves explicit setup with $name without running it during loading', async ({image}) => {
  const host = createHost(`export default {
    prompt: "Create a page",
    ${image}
    async setup({sandbox}) {
      await sandbox.writeFile("setup.txt", "Custom setup")
    },
  }`)
  await using sandbox = await VirtualSandbox.create({host})
  await sandbox.writeFile('setup.txt', 'Not run')

  const scenario = await loadScenario({host, directory: '/scenarios/example'})

  expect(await sandbox.readFile('setup.txt')).toBe('Not run')
  expect(scenario.setup).toBeTypeOf('function')
  await scenario.setup!({sandbox})
  expect(await sandbox.readFile('setup.txt')).toBe('Custom setup')
})

test('loadScenario wires configured checks and judges into a usable scenario in configuration order', async () => {
  const host = createHost(`export default {
    prompt: 'Create a page',
    checks: [
      {
        name: 'first',
        async run() {
          return {outcomes: [{type: 'outcome', status: 'passed'}]}
        },
      },
      {
        name: 'second',
        async run() {
          return {outcomes: []}
        },
      },
    ],
    judges: [
      {name: 'visual', files: ['reference.txt'], scores: [{value: 1, description: 'Matches'}]},
      {name: 'usability', scores: [{value: 1, description: 'Usable'}]},
    ],
  }`)
  await host.fs.writeFile('/scenarios/example/reference.txt', 'Expected appearance')
  await using sandbox = await VirtualSandbox.create({host})

  const scenario = ScenarioSchema.parse(await loadScenario({host, directory: '/scenarios/example'}))

  expect(
    scenario.checks.map(check => {
      return check.name
    }),
  ).toEqual(['first', 'second'])
  await expect(scenario.checks[0]!.run({logger, sandbox})).resolves.toEqual([
    {type: 'outcomes', outcomes: [{type: 'outcome', status: 'passed'}]},
  ])
  expect(
    scenario.judges.map(judge => {
      return judge.name
    }),
  ).toEqual(['visual', 'usability'])
  await expect(host.fs.readFile(scenario.judges[0]!.files[0]!.filepath, 'utf8')).resolves.toBe('Expected appearance')
})

test('loadScenario reports a missing directory using the default name', async () => {
  const host = VirtualHost.create()

  await expect(loadScenario({host, directory: '/scenarios/missing'})).rejects.toThrow(
    'Scenario "missing" directory was not found: /scenarios/missing',
  )
})

test('loadScenario rejects a file used as the scenario directory with the explicit name', async () => {
  const host = VirtualHost.create({'/scenarios/example': 'Not a directory'})

  await expect(loadScenario({host, directory: '/scenarios/example', name: 'custom'})).rejects.toThrow(
    'Scenario "custom" directory was not found: /scenarios/example',
  )
})

test('loadScenario reports the missing config path with the explicit name', async () => {
  const host = VirtualHost.create()
  await host.fs.mkdir('/scenarios/example', {recursive: true})

  await expect(loadScenario({host, directory: '/scenarios/example', name: 'custom'})).rejects.toThrow(
    'Scenario "custom" config file was not found: /scenarios/example/scenario.config.ts',
  )
})

test('loadScenario rejects a module without a default config export', async () => {
  const host = createHost('export const config = {prompt: "Create a page"}')

  await expect(loadScenario({host, directory: '/scenarios/example'})).rejects.toThrow()
})

test.each([
  {
    name: 'check',
    config: `checks: [{
      name: "tests",
      files: ["missing.ts"],
      async run() {
        return {outcomes: []}
      },
    }]`,
    message: 'Check config file does not exist: missing.ts',
  },
  {
    name: 'judge',
    config: 'judges: [{name: "visual", files: ["missing.png"], scores: [{value: 1, description: "Matches"}]}]',
    message: 'Judge config file does not exist: missing.png',
  },
])('loadScenario rejects a failed $name parse rather than returning a partial scenario', async ({config, message}) => {
  const host = createHost(`export default {prompt: "Create a page", ${config}}`)

  await expect(loadScenario({host, directory: '/scenarios/example'})).rejects.toThrow(message)
})
