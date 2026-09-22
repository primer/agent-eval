import path from 'node:path'
import {afterEach, describe, expect, test, vi} from 'vitest'
import {VirtualHost} from '../host'
import {listScenarios} from './list'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('listScenarios', () => {
  test('returns scenarios in name order regardless of directory enumeration order', async () => {
    const host = VirtualHost.create({
      '/scenarios/z-last/package.json': '{}',
      '/scenarios/z-last/scenario.config.ts': 'export default {prompt: "Last task"}',
      '/scenarios/a-first/package.json': '{}',
      '/scenarios/a-first/scenario.config.ts': 'export default {prompt: "First task"}',
    })
    const readdir = host.fs.readdir.bind(host.fs)
    vi.spyOn(host.fs, 'readdir').mockImplementation(async (...args) => {
      return (await readdir(...args)).reverse()
    })

    const scenarios = await listScenarios({host, directory: '/scenarios'})

    expect(
      scenarios.map(({id, directory, prompt}) => {
        return {id, directory, prompt}
      }),
    ).toEqual([
      {id: 'a-first', directory: '/scenarios/a-first', prompt: 'First task'},
      {id: 'z-last', directory: '/scenarios/z-last', prompt: 'Last task'},
    ])
  })

  test('discovers only visible immediate directories with both required files', async () => {
    const host = VirtualHost.create({
      '/scenarios/notes.txt': 'Not a scenario',
      '/scenarios/package-only/package.json': '{}',
      '/scenarios/config-only/scenario.config.ts': 'throw new Error("Do not load an unpackaged directory")',
      '/scenarios/.hidden/package.json': '{}',
      '/scenarios/.hidden/scenario.config.ts': 'throw new Error("Do not load a hidden directory")',
      '/scenarios/container/nested/package.json': '{}',
      '/scenarios/container/nested/scenario.config.ts': 'export default {prompt: "Nested task"}',
      '/scenarios/visible/package.json': '{}',
      '/scenarios/visible/scenario.config.ts': 'export default {prompt: "Visible task"}',
    })

    const scenarios = await listScenarios({host, directory: '/scenarios'})

    expect(
      scenarios.map(scenario => {
        return scenario.id
      }),
    ).toEqual(['visible'])
  })

  test('skips invalid or missing default configs without dropping valid neighbors', async () => {
    const host = VirtualHost.create({
      '/scenarios/a-valid/package.json': '{}',
      '/scenarios/a-valid/scenario.config.ts': 'export default {prompt: "First valid task"}',
      '/scenarios/invalid/package.json': '{}',
      '/scenarios/invalid/scenario.config.ts': 'export default {}',
      '/scenarios/no-default/package.json': '{}',
      '/scenarios/no-default/scenario.config.ts': 'export const prompt = "Not a default config"',
      '/scenarios/z-valid/package.json': '{}',
      '/scenarios/z-valid/scenario.config.ts': 'export default {prompt: "Last valid task"}',
    })

    const scenarios = await listScenarios({host, directory: '/scenarios'})

    expect(
      scenarios.map(scenario => {
        return scenario.id
      }),
    ).toEqual(['a-valid', 'z-valid'])
  })

  test('returns an empty list for an empty directory', async () => {
    const host = VirtualHost.create()
    await host.fs.mkdir('/scenarios')

    const scenarios = await listScenarios({host, directory: '/scenarios'})

    expect(scenarios).toEqual([])
  })

  test('accepts a directory relative to the working directory', async () => {
    const host = VirtualHost.create({
      [path.resolve('scenarios/example/package.json')]: '{}',
      [path.resolve('scenarios/example/scenario.config.ts')]: 'export default {prompt: "Relative task"}',
    })

    const scenarios = await listScenarios({host, directory: 'scenarios'})

    expect(
      scenarios.map(({id, prompt}) => {
        return {id, prompt}
      }),
    ).toEqual([{id: 'example', prompt: 'Relative task'}])
  })

  test('rejects a missing directory rather than returning an empty list', async () => {
    const host = VirtualHost.create()

    await expect(listScenarios({host, directory: '/missing'})).rejects.toThrow(/ENOENT/)
  })

  test('rejects a file used as the scenarios directory', async () => {
    const host = VirtualHost.create({'/scenarios': 'Not a directory'})

    await expect(listScenarios({host, directory: '/scenarios'})).rejects.toThrow(
      'Expected scenarios path to be a directory',
    )
  })

  test('propagates directory enumeration failures', async () => {
    const host = VirtualHost.create()
    await host.fs.mkdir('/scenarios')
    vi.spyOn(host.fs, 'readdir').mockRejectedValue(new Error('Cannot read scenarios directory'))

    await expect(listScenarios({host, directory: '/scenarios'})).rejects.toThrow('Cannot read scenarios directory')
  })

  test('rejects when a candidate module throws instead of returning a partial list', async () => {
    const host = VirtualHost.create({
      '/scenarios/a-valid/package.json': '{}',
      '/scenarios/a-valid/scenario.config.ts': 'export default {prompt: "Valid before module failure"}',
      '/scenarios/b-broken/package.json': '{}',
      '/scenarios/b-broken/scenario.config.ts': 'throw new Error("Scenario module failed")',
    })

    await expect(listScenarios({host, directory: '/scenarios'})).rejects.toThrow('Scenario module failed')
  })

  test('propagates scenario loading failures after a config passes discovery', async () => {
    const host = VirtualHost.create({
      '/scenarios/a-valid/package.json': '{}',
      '/scenarios/a-valid/scenario.config.ts': 'export default {prompt: "Valid before resource failure"}',
      '/scenarios/b-broken/package.json': '{}',
      '/scenarios/b-broken/scenario.config.ts':
        'export default {prompt: "Build task", image: {dockerfile: "missing.Dockerfile"}}',
    })

    await expect(listScenarios({host, directory: '/scenarios'})).rejects.toThrow(
      'Dockerfile does not exist: missing.Dockerfile',
    )
  })
})
