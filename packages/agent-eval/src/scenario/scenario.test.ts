import {afterEach, expect, test, vi} from 'vitest'
import {DefaultHost, VirtualHost} from '../host'
import {getScenario} from './get'
import {listScenarios} from './list'
import {loadScenario} from './load'
import {defineConfig} from './config'
import {defaultScenarioSetup, ScenarioSchema} from './scenario'
import {logger} from '../logger'
import {VirtualSandbox} from '../sandbox'

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

test('scenario helpers accept an options object with an injected host', async () => {
  const host = createHost()
  const expected = {
    id: 'example',
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

  await expect(loadScenario({host, directory: '/scenarios/example'})).resolves.toEqual(expected)
  await expect(getScenario({host, directory: '/scenarios', name: 'example'})).resolves.toEqual(expected)
  await expect(listScenarios({host, directory: '/scenarios'})).resolves.toEqual([expected])
})

test('scenario helpers use DefaultHost when host is omitted', async () => {
  const host = createHost()
  vi.spyOn(DefaultHost, 'existsSync').mockImplementation(host.existsSync)
  vi.spyOn(DefaultHost.fs, 'stat').mockImplementation(host.fs.stat)
  vi.spyOn(DefaultHost.fs, 'readdir').mockImplementation(host.fs.readdir)
  const loadModule = vi.spyOn(DefaultHost, 'loadModule').mockImplementation(host.loadModule.bind(host))

  await expect(loadScenario({directory: '/scenarios/example'})).resolves.toMatchObject({id: 'example'})
  await expect(getScenario({directory: '/scenarios', name: 'example'})).resolves.toMatchObject({id: 'example'})
  await expect(listScenarios({directory: '/scenarios'})).resolves.toMatchObject([{id: 'example'}])
  expect(loadModule).toHaveBeenCalledWith('/scenarios/example/scenario.config.ts')
})

test('loadScenario uses an explicit name as the scenario id', async () => {
  await expect(
    loadScenario({host: createHost(), directory: '/scenarios/example', name: 'custom'}),
  ).resolves.toMatchObject({id: 'custom', directory: '/scenarios/example'})
})

test.each([
  {
    name: 'string reference',
    image: 'node:26-slim',
    expected: {type: 'Reference', name: 'node:26-slim'},
  },
  {
    name: 'object reference',
    image: {name: 'node:26-slim'},
    expected: {type: 'Reference', name: 'node:26-slim'},
  },
  {
    name: 'relative Dockerfile',
    image: {dockerfile: 'Dockerfile'},
    expected: {type: 'Build', dockerfile: '/scenarios/example/Dockerfile', context: '/scenarios/example'},
  },
  {
    name: 'absolute Dockerfile and context',
    image: {dockerfile: '/scenarios/example/Dockerfile', context: '/scenarios/example'},
    expected: {type: 'Build', dockerfile: '/scenarios/example/Dockerfile', context: '/scenarios/example'},
  },
])('loadScenario accepts a $name normalized by defineConfig', async ({image, expected}) => {
  const host = createHost()
  await host.fs.writeFile('/scenarios/example/Dockerfile', 'FROM node:26-slim')
  const config = defineConfig({prompt: 'Create a page', image})
  vi.spyOn(host, 'loadModule').mockResolvedValue({default: config})

  await expect(loadScenario({host, directory: '/scenarios/example'})).resolves.toMatchObject({
    image: expected,
    setup: undefined,
  })
})

test('loadScenario normalizes check results after defineConfig and config parsing', async () => {
  const host = createHost()
  const config = defineConfig({
    prompt: 'Create a page',
    checks: [
      {
        name: 'example',
        async run() {
          return [
            {id: 'tests', outcomes: [{type: 'outcome', status: 'passed'}]},
            {id: 'score', measurements: [{type: 'measurement', value: 42}], unit: 'points'},
          ]
        },
      },
      {
        name: 'single',
        async run() {
          return {outcomes: [{type: 'outcome', status: 'passed'}]}
        },
      },
    ],
  })
  vi.spyOn(host, 'loadModule').mockResolvedValue({default: config})
  const scenario = ScenarioSchema.parse(await loadScenario({host, directory: '/scenarios/example'}))
  await using sandbox = await VirtualSandbox.create()

  await expect(scenario.checks[0]!.run({logger, sandbox})).resolves.toEqual([
    {type: 'outcomes', id: 'tests', outcomes: [{type: 'outcome', status: 'passed'}]},
    {type: 'measurements', id: 'score', measurements: [{type: 'measurement', value: 42}], unit: 'points'},
  ])
  await expect(scenario.checks[1]!.run({logger, sandbox})).resolves.toEqual([
    {type: 'outcomes', outcomes: [{type: 'outcome', status: 'passed'}]},
  ])
})

test('getScenario reports a missing name with the supplied directory', async () => {
  await expect(getScenario({host: createHost(), directory: '/scenarios', name: 'missing'})).rejects.toThrow(
    'Scenario "missing" was not found in: /scenarios',
  )
})

test('loadScenario reports a missing directory using the default name', async () => {
  await expect(loadScenario({host: createHost(), directory: '/scenarios/missing'})).rejects.toThrow(
    'Scenario "missing" directory was not found: /scenarios/missing',
  )
})
