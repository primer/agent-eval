import {afterEach, expect, test, vi} from 'vitest'
import {VirtualHost} from '../host'
import {VirtualSandbox} from '../sandbox'
import {ControlTreatment} from '../treatment'
import {getBenchmark} from './get'
import {createBenchmarkPlan, createBenchmarkPlanManifest, parseBenchmarkPlanManifest} from './plan'

afterEach(() => {
  vi.restoreAllMocks()
})

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

test('rejects duplicate trial IDs in benchmark plans', async () => {
  const host = createHost()
  const options = {host, benchmarksDirectory: '/benchmarks', scenariosDirectory: '/scenarios'}
  const benchmark = await getBenchmark({...options, name: 'design-system'})
  const plan = createBenchmarkPlan({benchmark})
  const manifest = createBenchmarkPlanManifest({benchmark, plan})
  manifest.trials[1].id = manifest.trials[0].id

  await expect(parseBenchmarkPlanManifest({...options, contents: JSON.stringify(manifest)})).rejects.toThrow(
    `Duplicate trial ID in benchmark plan: ${manifest.trials[0].id}`,
  )
})

test('preserves capability setup for control and benchmark trials in created and restored plans', async () => {
  const host = createHost()
  const capabilitySetup = vi.fn(async () => {
    return undefined
  })
  const benchmarkSetup = vi.fn(async () => {
    return undefined
  })
  const config = {
    name: 'Design System',
    description: 'Example benchmark',
    models: ['gpt-5.5'],
    setup: benchmarkSetup,
    capabilities: [{name: 'Components', scenarios: ['example'], setup: capabilitySetup}],
  }
  const loadModule = vi.spyOn(host, 'loadModule').mockResolvedValueOnce({default: config})
  const options = {host, benchmarksDirectory: '/benchmarks', scenariosDirectory: '/scenarios'}
  const benchmark = await getBenchmark({...options, name: 'design-system'})
  const plan = createBenchmarkPlan({benchmark})
  const manifest = createBenchmarkPlanManifest({benchmark, plan})
  loadModule.mockResolvedValueOnce({default: config})
  const parsed = await parseBenchmarkPlanManifest({...options, contents: JSON.stringify(manifest)})
  await using sandbox = await VirtualSandbox.create()

  for (const {benchmark: definition, trials} of [{benchmark, trials: plan.trials}, parsed]) {
    expect(trials).toHaveLength(2)
    for (const trial of trials) {
      expect(trial.setup).toBe(definition.capabilities[0].setup)
      if (trial.treatment.id === ControlTreatment.id) {
        expect(trial.treatment.setup).toBeUndefined()
      } else {
        expect(trial.treatment.setup).toBe(definition.setup)
      }
      await trial.setup?.({sandbox})
    }
  }
  expect(capabilitySetup).toHaveBeenCalledTimes(4)
  expect(benchmarkSetup).not.toHaveBeenCalled()
})
