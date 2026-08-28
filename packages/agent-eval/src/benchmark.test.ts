import {test, expect} from 'vitest'
import {defineConfig, listBenchmarks, getBenchmark, run} from './benchmark'
import {VirtualHost} from './host'
import {defineConfig as defineScenarioConfig} from './scenario'

test('listBenchmarks', async () => {
  const config = JSON.stringify(
    defineConfig({
      name: 'test',
      description: 'test',
      models: [],
      capabilities: [],
    }),
  )
  const host = VirtualHost.create({
    '/benchmarks': {
      '01-benchmark.ts': `export const benchmark = ${config}`,
      '02-default-export.ts': `export default ${config}`,
      // '03-invalid-config.ts': `export const benchmark = {}`,
      '03-no-config.ts': ``,
    },
  })
  const benchmarks = await listBenchmarks(host, '/benchmarks')

  expect(benchmarks).toHaveLength(2)
  expect(benchmarks).toContainEqual({
    id: '01-benchmark',
    name: 'test',
    description: 'test',
    models: [],
    capabilities: [],
  })
  expect(benchmarks).toContainEqual({
    id: '02-default-export',
    name: 'test',
    description: 'test',
    models: [],
    capabilities: [],
  })

  expect(benchmarks).not.toContainEqual(
    expect.objectContaining({
      id: '03-no-config',
    }),
  )
})

test('listBenchmarks throw error on invalid config', async () => {
  const config = JSON.stringify(
    defineConfig({
      name: 'test',
      description: 'test',
      models: [],
      capabilities: [],
    }),
  )
  const host = VirtualHost.create({
    '/benchmarks': {
      '01-benchmark.ts': `export const benchmark = ${config}`,
      '03-invalid-config.ts': `export const benchmark = {}`,
    },
  })

  await expect(listBenchmarks(host, '/benchmarks')).rejects.toThrowErrorMatchingInlineSnapshot(`
    [Error: Benchmark file must export a valid benchmark config: /benchmarks/03-invalid-config.ts
    ✖ Invalid input
      → at name
    ✖ Invalid input
      → at description
    ✖ Invalid input
      → at models
    ✖ Invalid input
      → at capabilities]
  `)
})

test('getBenchmark', async () => {
  const config = JSON.stringify(
    defineConfig({
      name: 'test',
      description: 'test',
      models: [],
      capabilities: [],
    }),
  )
  const host = VirtualHost.create({
    '/benchmarks': {
      '01-benchmark.ts': `export const benchmark = ${config}`,
      '02-benchmark.ts': `export const benchmark = ${config}`,
    },
  })
  const benchmark = await getBenchmark(host, '/benchmarks', '01-benchmark')

  expect(benchmark).toEqual({
    id: '01-benchmark',
    name: 'test',
    description: 'test',
    models: [],
    capabilities: [],
  })

  await expect(getBenchmark(host, '/benchmarks', 'non-existent')).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: Benchmark "non-existent" was not found in: /benchmarks]`,
  )
})

test('getBenchmark throw error on invalid config', async () => {
  const config = JSON.stringify(
    defineConfig({
      name: 'test',
      description: 'test',
      models: [],
      capabilities: [],
    }),
  )
  const host = VirtualHost.create({
    '/benchmarks': {
      '01-benchmark.ts': `export const benchmark = ${config}`,
      '02-invalid-config.ts': `export const benchmark = {}`,
    },
  })

  await expect(getBenchmark(host, '/benchmarks', '02-invalid-config')).rejects.toThrowErrorMatchingInlineSnapshot(`
    [Error: Benchmark file must export a valid benchmark config: /benchmarks/02-invalid-config.ts
    ✖ Invalid input
      → at name
    ✖ Invalid input
      → at description
    ✖ Invalid input
      → at models
    ✖ Invalid input
      → at capabilities]
  `)
})

test('run', async () => {
  const scenario = JSON.stringify(
    defineScenarioConfig({
      prompt: 'test',
    }),
  )
  const host = VirtualHost.create({
    '/artifacts': {},
    '/benchmarks': {},
    '/scenarios': {
      '001-scenario': {
        'scenario.config.ts': `export default ${scenario}`,
        'scenario.test.ts': '',
        'package.json': JSON.stringify({}),
      },
      '002-scenario': {
        'scenario.config.ts': `export default ${scenario}`,
        'scenario.test.ts': '',
        'package.json': JSON.stringify({}),
      },
    },
  })
  await run(
    {
      artifactsDirectory: '/artifacts',
      benchmarksDirectory: '/benchmarks',
      host,
      scenariosDirectory: '/scenarios',
    },
    {
      id: 'test',
      name: 'test',
      description: 'test',
      models: ['gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6-sol'],
      capabilities: [
        {
          name: 'test',
          scenarios: ['001-scenario', '002-scenario'],
        },
      ],
    },
  )
})
