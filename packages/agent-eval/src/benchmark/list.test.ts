import {expect, test} from 'vitest'
import {VirtualHost} from '../host'
import {defineConfig} from './config'
import {getBenchmark} from './get'
import {listBenchmarks} from './list'

function config(id?: string): string {
  return `export default ${JSON.stringify({
    id,
    name: 'Example',
    description: 'Example benchmark',
    models: [],
    capabilities: [],
  })}`
}

test('listBenchmarks derives namespaced IDs independently of the absolute root and module extension', async () => {
  const host = VirtualHost.create({
    '/first/benchmarks/example.ts': config(),
    '/second/benchmarks/example.mjs': config(),
  })

  for (const root of ['/first/benchmarks', '/second/benchmarks']) {
    const benchmarks = await listBenchmarks({
      host,
      benchmarksDirectory: root,
      scenariosDirectory: '/scenarios',
    })

    expect(
      benchmarks.map(benchmark => {
        return benchmark.id
      }),
    ).toEqual(['1787045954'])
  }
})

test('getBenchmark preserves an explicit ID across renames and accepts path or ID selectors', async () => {
  const host = VirtualHost.create({
    '/benchmarks/original.ts': config('pinned'),
  })
  const options = {
    host,
    benchmarksDirectory: '/benchmarks',
    scenariosDirectory: '/scenarios',
  }

  expect((await getBenchmark({...options, name: 'original'})).id).toBe('pinned')
  await host.fs.promises.rename('/benchmarks/original.ts', '/benchmarks/renamed.ts')

  for (const name of ['renamed', 'pinned']) {
    expect((await getBenchmark({...options, name})).id).toBe('pinned')
  }
})

test('listBenchmarks rejects duplicate explicit and derived IDs', async () => {
  const host = VirtualHost.create({
    '/benchmarks/example.ts': config(),
    '/benchmarks/other.ts': config('1787045954'),
  })

  await expect(
    listBenchmarks({
      host,
      benchmarksDirectory: '/benchmarks',
      scenariosDirectory: '/scenarios',
    }),
  ).rejects.toThrow('Duplicate benchmark ID: 1787045954')
})

test('getBenchmark prioritizes resolved IDs over another resource filename', async () => {
  const host = VirtualHost.create({
    '/benchmarks/original.ts': config('other'),
    '/benchmarks/other.ts': config('different'),
  })

  const benchmark = await getBenchmark({
    host,
    benchmarksDirectory: '/benchmarks',
    scenariosDirectory: '/scenarios',
    name: 'other',
  })

  expect(benchmark.filepath).toBe('/benchmarks/original.ts')
})

test('listBenchmarks rejects distinct inline scenarios with the same ID across capabilities', async () => {
  const host = VirtualHost.create({
    '/benchmarks/example.ts': `export default {
      name: "Example", description: "Example", models: [],
      capabilities: [
        {name: "First", scenarios: [{path: "/external/first"}]},
        {name: "Second", scenarios: [{path: "/external/second"}]},
      ],
    }`,
    '/external/first/scenario.config.ts': 'export default {id: "same", prompt: "First"}',
    '/external/second/scenario.config.ts': 'export default {id: "same", prompt: "Second"}',
  })

  await expect(
    listBenchmarks({
      host,
      benchmarksDirectory: '/benchmarks',
      scenariosDirectory: '/scenarios',
    }),
  ).rejects.toThrow('Duplicate scenario ID: same')
})

test.each(['', '   '])('benchmark defineConfig rejects a blank explicit ID: %j', id => {
  expect(() => {
    return defineConfig({
      id,
      name: 'Example',
      description: 'Example benchmark',
      models: [],
      capabilities: [],
    })
  }).toThrow()
})
