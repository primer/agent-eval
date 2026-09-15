import {expect, test} from 'vitest'
import {VirtualHost} from '../host'
import {getBenchmark} from './get'
import {createBenchmarkPlan, createBenchmarkPlanManifest, parseBenchmarkPlanManifest} from './plan'

function benchmarkConfig(name: string): string {
  return `export default ${JSON.stringify({
    name,
    description: 'Example benchmark',
    models: ['gpt-5.5'],
    capabilities: [{name: 'Components', scenarios: ['example']}],
  })}`
}

function createHost() {
  return VirtualHost.create({
    '/benchmarks/design-system.ts': benchmarkConfig('Design System'),
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {prompt: "Create a page"}',
  })
}

test.each(['Design System', 'Renamed Design System'])(
  'loads a benchmark plan by ID with display name %s',
  async name => {
    const host = createHost()
    const options = {host, benchmarksDirectory: '/benchmarks', scenariosDirectory: '/scenarios'}
    const benchmark = await getBenchmark({...options, name: 'design-system'})
    const plan = createBenchmarkPlan({benchmark})
    const manifest = createBenchmarkPlanManifest({benchmark, plan})
    expect(manifest).toMatchObject({id: 'design-system', name: 'Design System'})
    expect(manifest.trials).toHaveLength(2)

    await host.fs.writeFile('/benchmarks/design-system.ts', benchmarkConfig(name))
    const parsed = await parseBenchmarkPlanManifest({...options, contents: JSON.stringify(manifest)})

    expect(parsed.benchmark).toMatchObject({id: 'design-system', name})
    expect(parsed.trials).toEqual(plan.trials)
  },
)

test('does not fall back to the display name when the benchmark plan ID is missing', async () => {
  const host = createHost()
  await expect(
    parseBenchmarkPlanManifest({
      host,
      benchmarksDirectory: '/benchmarks',
      scenariosDirectory: '/scenarios',
      contents: JSON.stringify({id: 'missing', name: 'design-system', trials: []}),
    }),
  ).rejects.toThrow('Benchmark "missing" was not found in: /benchmarks')
})
