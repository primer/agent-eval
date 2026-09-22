import {afterEach, expect, test, vi} from 'vitest'
import {DefaultHost, VirtualHost} from '../host'
import {getScenario} from './get'
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

  await expect(getScenario({host, directory: '/scenarios', name: 'example'})).resolves.toEqual(expected)
  await expect(listScenarios({host, directory: '/scenarios'})).resolves.toEqual([expected])
})

test('getScenario and listScenarios use DefaultHost when host is omitted', async () => {
  const host = createHost()
  vi.spyOn(DefaultHost, 'existsSync').mockImplementation(host.existsSync)
  vi.spyOn(DefaultHost.fs, 'stat').mockImplementation(host.fs.stat)
  vi.spyOn(DefaultHost.fs, 'readdir').mockImplementation(host.fs.readdir)
  const loadModule = vi.spyOn(DefaultHost, 'loadModule').mockImplementation(host.loadModule.bind(host))

  await expect(getScenario({directory: '/scenarios', name: 'example'})).resolves.toMatchObject({id: 'example'})
  await expect(listScenarios({directory: '/scenarios'})).resolves.toMatchObject([{id: 'example'}])
  expect(loadModule).toHaveBeenCalledWith('/scenarios/example/scenario.config.ts')
})

test('getScenario reports a missing name with the supplied directory', async () => {
  await expect(getScenario({host: createHost(), directory: '/scenarios', name: 'missing'})).rejects.toThrow(
    'Scenario "missing" was not found in: /scenarios',
  )
})
