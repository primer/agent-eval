import {afterEach, expect, test, vi} from 'vitest'
import type {CopilotRunner} from '../copilot-runner'
import {VirtualHost} from '../host'
import {VirtualSandbox} from '../sandbox'
import {ControlTreatment} from '../treatment'
import {getBenchmark} from './get'
import {createBenchmarkPlan, createBenchmarkPlanManifest, parseBenchmarkPlanManifest} from './plan'

afterEach(() => {
  vi.restoreAllMocks()
})

function benchmarkConfig(name: string, runners?: Array<CopilotRunner>): string {
  return `export default ${JSON.stringify({
    name,
    description: 'Example benchmark',
    models: ['gpt-5.5'],
    runners,
    capabilities: [{name: 'Components', scenarios: ['example']}],
  })}`
}

function createHost(runners?: Array<CopilotRunner>) {
  return VirtualHost.create({
    '/benchmarks/design-system.ts': benchmarkConfig('Design System', runners),
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {prompt: "Create a page"}',
  })
}

test.each([
  {runners: undefined, expected: ['copilot-cli']},
  {runners: ['copilot-sdk'], expected: ['copilot-sdk']},
  {runners: ['copilot-cli', 'copilot-sdk'], expected: ['copilot-cli', 'copilot-sdk']},
] satisfies Array<{runners: Array<CopilotRunner> | undefined; expected: Array<CopilotRunner>}>)(
  'expands and restores configured benchmark runners: $runners',
  async ({runners, expected}) => {
    const options = {
      host: createHost(runners),
      benchmarksDirectory: '/benchmarks',
      scenariosDirectory: '/scenarios',
    }
    const benchmark = await getBenchmark({...options, name: 'design-system'})
    const plan = createBenchmarkPlan({benchmark})

    expect(plan.trials).toHaveLength(2 * expected.length)
    expect(
      new Set(
        plan.trials.map(trial => {
          return trial.id
        }),
      ).size,
    ).toBe(plan.trials.length)
    expect(
      new Set(
        plan.trials.map(trial => {
          return trial.runner
        }),
      ),
    ).toEqual(new Set(expected))
    for (const runner of expected) {
      const trials = plan.trials.filter(trial => {
        return trial.runner === runner
      })
      expect(
        trials
          .map(trial => {
            return trial.treatment.name
          })
          .sort(),
      ).toEqual(['Benchmark', 'Control'])
    }

    const manifest = createBenchmarkPlanManifest({benchmark, plan})
    const parsed = await parseBenchmarkPlanManifest({...options, contents: JSON.stringify(manifest)})

    expect(parsed.trials).toEqual(plan.trials)
  },
)

test('defaults legacy benchmark plans to the CLI', async () => {
  const options = {host: createHost(), benchmarksDirectory: '/benchmarks', scenariosDirectory: '/scenarios'}
  const benchmark = await getBenchmark({...options, name: 'design-system'})
  const plan = createBenchmarkPlan({benchmark})
  const manifest = createBenchmarkPlanManifest({benchmark, plan})
  const contents = JSON.stringify({
    ...manifest,
    trials: manifest.trials.map(({runner, ...trial}) => {
      expect(runner).toBe('copilot-cli')
      return trial
    }),
  })
  const parsed = await parseBenchmarkPlanManifest({...options, contents})
  expect(parsed.trials).toEqual(plan.trials)
})

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

test('rejects duplicate benchmark trial IDs before loading configuration', async () => {
  const trial = {
    id: 'duplicate',
    capabilityId: 'components',
    model: {
      name: 'gpt-5.5',
      reasoningEffort: 'medium',
    },
    scenarioId: 'example',
    treatmentId: 'control',
  }

  await expect(
    parseBenchmarkPlanManifest({
      host: VirtualHost.create(),
      benchmarksDirectory: '/benchmarks',
      scenariosDirectory: '/scenarios',
      contents: JSON.stringify({
        id: 'missing',
        name: 'Example',
        trials: [trial, trial],
      }),
    }),
  ).rejects.toMatchObject({
    issues: [
      {
        path: ['trials', 1, 'id'],
        message: 'Duplicate trial ID in benchmark plan: duplicate',
      },
    ],
  })
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

test.each([false, true])('validates capability-specific scenario membership (shared: %s)', async shared => {
  const host = createHost()
  await host.fs.mkdir('/scenarios/other')
  await host.fs.writeFile('/scenarios/other/package.json', '{}')
  await host.fs.writeFile('/scenarios/other/scenario.config.ts', 'export default {prompt: "Create another page"}')
  await host.fs.writeFile(
    '/benchmarks/design-system.ts',
    `export default ${JSON.stringify({
      name: 'Design System',
      description: 'Example benchmark',
      models: ['gpt-5.5'],
      capabilities: [
        {name: 'Components', scenarios: ['example']},
        {name: 'Layouts', scenarios: [shared ? 'example' : 'other']},
      ],
    })}`,
  )
  const options = {host, benchmarksDirectory: '/benchmarks', scenariosDirectory: '/scenarios'}
  const benchmark = await getBenchmark({...options, name: 'design-system'})
  const plan = createBenchmarkPlan({benchmark})
  const manifest = createBenchmarkPlanManifest({benchmark, plan})
  expect(manifest.trials).toHaveLength(4)

  if (shared) {
    const parsed = await parseBenchmarkPlanManifest({...options, contents: JSON.stringify(manifest)})
    expect(parsed.trials).toEqual(plan.trials)
    for (const trial of parsed.trials) {
      expect(trial.scenario).toBe(trial.capability.scenarios[0])
    }
  } else {
    const trial = manifest.trials[0]
    trial.scenarioId = trial.scenarioId === 'example' ? 'other' : 'example'
    await expect(parseBenchmarkPlanManifest({...options, contents: JSON.stringify(manifest)})).rejects.toThrow(
      `Scenario "${trial.scenarioId}" does not belong to capability "${trial.capabilityId}" for trial "${trial.id}"`,
    )
  }
})

test.each([
  {model: {name: 'gpt-5.5', reasoningEffort: 'medium'}, valid: true},
  {model: {name: 'gpt-5.6-luna', reasoningEffort: 'medium'}, valid: false},
  {model: {name: 'gpt-5.5', reasoningEffort: 'high'}, valid: false},
] as const)('validates benchmark model variant $model (configured: $valid)', async ({model, valid}) => {
  const host = createHost()
  const options = {host, benchmarksDirectory: '/benchmarks', scenariosDirectory: '/scenarios'}
  const benchmark = await getBenchmark({...options, name: 'design-system'})
  const plan = createBenchmarkPlan({benchmark})
  const manifest = createBenchmarkPlanManifest({benchmark, plan})
  manifest.trials[0].model = model

  const parsed = parseBenchmarkPlanManifest({...options, contents: JSON.stringify(manifest)})
  if (valid) {
    const result = await parsed
    expect(result.trials[0].model).toBe(result.benchmark.models[0])
  } else {
    await expect(parsed).rejects.toThrow(`Model variant not found for trial: ${manifest.trials[0].id}`)
  }
})
