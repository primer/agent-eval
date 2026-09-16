import {afterEach, expect, test, vi} from 'vitest'
import {DefaultHost, VirtualHost} from '../host'
import {getScenario} from './get'
import {listScenarios} from './list'
import {loadScenario} from './load'
import {defineConfig} from './config'
import {ScenarioSchema} from './scenario'
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
  'ghcr.io/example/project:latest',
  {dockerfile: './Dockerfile'},
  {dockerfile: './docker/Dockerfile', context: '../'},
] as const)('preserves image configuration: %j', image => {
  const config = defineConfig({prompt: 'Update the project', image})
  expect(config.image).toEqual(image)
  expect(
    ScenarioSchema.parse({
      id: 'example',
      directory: '/scenarios/example',
      ...config,
    }).image,
  ).toEqual(image)
})

test.each([
  '',
  '   ',
  null,
  false,
  123,
  {},
  {dockerfile: ''},
  {dockerfile: '   '},
  {dockerfile: 'Dockerfile', context: ''},
  {dockerfile: 'Dockerfile', context: '   '},
  {image: 'node:26', dockerfile: 'Dockerfile'},
  {context: '.'},
  {source: 'image', image: 'node:26'},
  {source: 'image', dockerfile: 'Dockerfile'},
])('rejects invalid image configuration: %j', image => {
  expect(() => {
    ScenarioSchema.parse({id: 'example', directory: '/scenarios/example', prompt: 'Update the project', image})
  }).toThrow()
})

test('loads an existing image without requiring a local Dockerfile', async () => {
  const host = createHost()
  const image = 'ghcr.io/example/project:latest'
  vi.spyOn(host, 'loadModule').mockResolvedValue({default: {prompt: 'Update the project', image}})

  const scenario = await loadScenario({host, directory: '/scenarios/example'})

  expect(scenario.image).toEqual(image)
})

test.each([undefined, '.', '..'])('loads a Dockerfile with scenario-relative context %s', async context => {
  const host = createHost()
  await host.fs.mkdir('/scenarios/example/docker')
  await host.fs.writeFile('/scenarios/example/docker/Dockerfile', 'FROM node:26-slim')
  const image = {dockerfile: './docker/Dockerfile', ...(context ? {context} : {})}
  vi.spyOn(host, 'loadModule').mockResolvedValue({default: {prompt: 'Update the project', image}})

  const scenario = await loadScenario({host, directory: '/scenarios/example'})

  expect(scenario.image).toEqual(image)
})

test.each([
  {dockerfile: 'missing', message: 'ENOENT'},
  {dockerfile: '.', message: 'Dockerfile is not a file'},
  {dockerfile: 'Dockerfile', context: 'missing', message: 'ENOENT'},
  {dockerfile: 'Dockerfile', context: 'package.json', message: 'Docker build context is not a directory'},
  {dockerfile: '../Dockerfile', message: 'Dockerfile must be inside the build context'},
  {dockerfile: 'linked.Dockerfile', message: 'Dockerfile must be inside the build context'},
])('rejects invalid local builds: %j', async ({message, ...build}) => {
  const host = createHost()
  await host.fs.writeFile('/scenarios/example/Dockerfile', 'FROM node:26-slim')
  await host.fs.writeFile('/scenarios/Dockerfile', 'FROM node:26-slim')
  await host.fs.symlink('/scenarios/Dockerfile', '/scenarios/example/linked.Dockerfile')
  vi.spyOn(host, 'loadModule').mockResolvedValue({
    default: {prompt: 'Update the project', image: build},
  })

  await expect(loadScenario({host, directory: '/scenarios/example'})).rejects.toThrow(message)
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

test('listScenarios preserves sorting and candidate filtering', async () => {
  const host = createHost()
  for (const id of ['z-last', 'a-first', '.hidden', 'invalid']) {
    await host.fs.mkdir(`/scenarios/${id}`)
    await host.fs.writeFile(`/scenarios/${id}/package.json`, '{}')
    await host.fs.writeFile(
      `/scenarios/${id}/scenario.config.ts`,
      id === 'invalid' ? 'export default {}' : 'export default {prompt: "Create a page"}',
    )
    await host.fs.writeFile(`/scenarios/${id}/scenario.test.ts`, '')
  }

  const scenarios = await listScenarios({host, directory: '/scenarios'})

  expect(
    scenarios.map(scenario => {
      return scenario.id
    }),
  ).toEqual(['a-first', 'example', 'z-last'])
})
