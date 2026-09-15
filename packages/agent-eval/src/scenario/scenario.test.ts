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
    {type: 'outcomes', id: 'tests', results: [{type: 'outcome', status: 'passed'}]},
    {type: 'measurements', id: 'score', results: [{type: 'measurement', value: 42}], unit: 'points'},
  ])
  await expect(scenario.checks[1]!.run({logger, sandbox})).resolves.toEqual([
    {type: 'outcomes', results: [{type: 'outcome', status: 'passed'}]},
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
  for (const id of ['z-last', 'a-first', '.hidden', 'invalid', 'missing-test']) {
    await host.fs.mkdir(`/scenarios/${id}`)
    await host.fs.writeFile(`/scenarios/${id}/package.json`, '{}')
    await host.fs.writeFile(
      `/scenarios/${id}/scenario.config.ts`,
      id === 'invalid' ? 'export default {}' : 'export default {prompt: "Create a page"}',
    )
    if (id !== 'missing-test') {
      await host.fs.writeFile(`/scenarios/${id}/scenario.test.ts`, '')
    }
  }

  const scenarios = await listScenarios({host, directory: '/scenarios'})

  expect(
    scenarios.map(scenario => {
      return scenario.id
    }),
  ).toEqual(['a-first', 'example', 'z-last'])
})
