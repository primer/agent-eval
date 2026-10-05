import {afterEach, expect, test, vi} from 'vitest'
import {hash} from '../hash'
import {DefaultHost, VirtualHost} from '../host'
import {getScenario, getScenarioByName} from './get'
import {listScenarios} from './list'
import {defaultScenarioSetup} from './scenario'

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
  const id = hash('Scenario:example')
  const expected = {
    id,
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

  await expect(getScenarioByName({host, directory: '/scenarios', name: 'example'})).resolves.toEqual(expected)
  await expect(getScenario({host, directory: '/scenarios', id})).resolves.toEqual(expected)
  await expect(listScenarios({host, directory: '/scenarios'})).resolves.toEqual([expected])
})

test('getScenario and listScenarios use DefaultHost when host is omitted', async () => {
  const host = createHost()
  const id = hash('Scenario:example')
  vi.spyOn(DefaultHost, 'existsSync').mockImplementation(host.existsSync)
  vi.spyOn(DefaultHost.fs, 'stat').mockImplementation(host.fs.stat)
  vi.spyOn(DefaultHost.fs, 'readdir').mockImplementation(host.fs.readdir)
  const loadModule = vi.spyOn(DefaultHost, 'loadModule').mockImplementation(host.loadModule.bind(host))

  await expect(getScenarioByName({directory: '/scenarios', name: 'example'})).resolves.toMatchObject({
    id,
  })
  await expect(listScenarios({directory: '/scenarios'})).resolves.toMatchObject([{id}])
  expect(loadModule).toHaveBeenCalledWith('/scenarios/example/scenario.config.ts')
})

test('getScenario reports a missing name with the supplied directory', async () => {
  await expect(getScenarioByName({host: createHost(), directory: '/scenarios', name: 'missing'})).rejects.toThrow(
    'Scenario "missing" was not found in: /scenarios',
  )
})
