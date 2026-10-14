import {expect, expectTypeOf, onTestFinished, test, vi} from 'vitest'
import type {CopilotRunner} from '../copilot-runner'
import {VirtualHost} from '../host'
import {RunTrialResultSchema} from '../trial/run'
import {getBenchmark} from './get'
import {createBenchmarkPlan} from './plan'
import {
  BenchmarkOutputFileSchema,
  createBenchmarkOutput,
  listBenchmarkOutputFiles,
  mergeBenchmarkOutputFiles,
  parseBenchmarkTrialOutput,
  writeBenchmarkOutput,
  type BenchmarkTrialOutput,
} from './output'

const trial = {
  id: 'trial',
  model: {
    name: 'gpt-5.5',
    reasoningEffort: 'medium',
  },
  capabilityId: 'components',
  scenarioId: 'example',
  treatmentId: 'control',
  agent: {
    sessions: [],
  },
  artifacts: {
    directory: '/artifacts/trial',
    copilotConfigDirectory: '/artifacts/trial/copilot',
    skillsConfigDirectory: '/artifacts/trial/skills',
    walkthroughDirectory: '/artifacts/trial/walkthrough',
    workspaceDirectory: '/artifacts/trial/workspace',
  },
  checks: [],
  createdAt: '2026-10-14T20:00:00.000Z',
  judges: [],
  walkthrough: {
    type: 'Unavailable',
  },
}

const capabilities = new Map([
  [
    'components',
    {
      id: 'components',
      name: 'Components',
      scenarioIds: ['example'],
    },
  ],
])

test('defaults the missing CLI runner when parsing benchmark output', () => {
  const parsed = parseBenchmarkTrialOutput(trial, capabilities)

  expect(parsed.runner).toBe('copilot-cli')
  expect(parsed.createdAt).toBe(trial.createdAt)
  expect(BenchmarkOutputFileSchema.parse(createOutputFile()).createdAt).toBe(trial.createdAt)
  expectTypeOf<BenchmarkTrialOutput['runner']>().toEqualTypeOf<CopilotRunner>()
})

test('requires createdAt on benchmark output and trials', () => {
  const trialWithoutCreatedAt: Record<string, unknown> = {...trial}
  const outputWithoutCreatedAt: Record<string, unknown> = createOutputFile()
  delete trialWithoutCreatedAt.createdAt
  delete outputWithoutCreatedAt.createdAt

  expect(() => parseBenchmarkTrialOutput(trialWithoutCreatedAt, capabilities)).toThrow()
  expect(() => BenchmarkOutputFileSchema.parse(outputWithoutCreatedAt)).toThrow()
})

test.each(['copilot-cli', 'copilot-sdk'] as const)('preserves the explicit %s benchmark output runner', runner => {
  const parsed = parseBenchmarkTrialOutput(
    {
      ...trial,
      runner,
    },
    capabilities,
  )

  expect(parsed.runner).toBe(runner)
})

test.each([null, 'unknown'])('rejects an invalid benchmark output runner: %s', runner => {
  expect(() => {
    parseBenchmarkTrialOutput(
      {
        ...trial,
        runner,
      },
      capabilities,
    )
  }).toThrow()
})

function createOutputFile(trials: Record<string, string> = {}) {
  return {
    id: 'example',
    createdAt: '2026-10-14T20:00:00.000Z',
    capabilities: {
      components: {
        id: 'components',
        name: 'Components',
        scenarioIds: ['example'],
      },
    },
    scenarios: {
      example: {
        id: 'example',
        directory: '/scenarios/example',
        prompt: 'Create a page',
        tags: [],
        judges: [],
      },
    },
    treatments: {
      control: {
        id: 'control',
        name: 'Control',
      },
    },
    trials,
  }
}

test.each([null, 'yesterday', '2026-02-30T00:00:00.000Z'])(
  'rejects invalid benchmark artifact timestamps: %s',
  createdAt => {
    expect(() => {
      BenchmarkOutputFileSchema.parse({
        ...createOutputFile(),
        createdAt,
      })
    }).toThrow()
    expect(() => {
      parseBenchmarkTrialOutput(
        {
          ...trial,
          createdAt,
        },
        capabilities,
      )
    }).toThrow()
  },
)

test('preserves benchmark trial creation times through writing and merging with a new manifest timestamp', async () => {
  vi.useFakeTimers({toFake: ['Date']})
  onTestFinished(() => {
    vi.useRealTimers()
  })
  const trialCreatedAt = '2026-10-14T20:00:00.000Z'
  const outputCreatedAt = '2026-10-14T20:01:00.000Z'
  const mergedCreatedAt = '2026-10-14T20:02:00.000Z'
  const host = VirtualHost.create({
    '/benchmarks/example.ts':
      'export default {name: "Example", description: "Example", models: ["gpt-5.5"], capabilities: [{name: "Components", scenarios: ["example"]}]}',
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {prompt: "Build a page"}',
  })
  const benchmark = await getBenchmark({
    host,
    name: 'example',
    benchmarksDirectory: '/benchmarks',
    scenariosDirectory: '/scenarios',
  })
  const plan = createBenchmarkPlan({benchmark})
  const results = plan.trials.map(entry => {
    return {
      trial: entry,
      result: RunTrialResultSchema.parse({
        ...trial,
        createdAt: trialCreatedAt,
        trial: entry,
        artifacts: {
          ...trial.artifacts,
          directory: `/results/artifacts/${entry.id}`,
        },
      }),
    }
  })
  vi.setSystemTime(outputCreatedAt)
  const output = createBenchmarkOutput({benchmark, runPlanResult: {results}})
  for (const entry of output.trials.values()) {
    await host.fs.promises.mkdir(entry.artifacts.directory, {recursive: true})
  }

  await writeBenchmarkOutput({
    host,
    output,
    outputPath: '/results/output-1.json',
  })
  const [[file]] = await listBenchmarkOutputFiles({host, outputDirectory: '/results'})
  expect(file.createdAt).toBe(outputCreatedAt)
  vi.setSystemTime(mergedCreatedAt)
  const merged = await mergeBenchmarkOutputFiles({
    host,
    outputs: [file],
    outputDirectory: '/results',
  })
  expect(merged).toEqual({
    ...output,
    createdAt: mergedCreatedAt,
  })
  expect(
    [...merged.trials.values()].map(entry => {
      return entry.createdAt
    }),
  ).toEqual(
    results.map(() => {
      return trialCreatedAt
    }),
  )
  await writeBenchmarkOutput({host, output: merged, outputPath: '/results/output.json'})
  const manifest = JSON.parse(await host.fs.promises.readFile('/results/output.json', 'utf-8'))
  expect(manifest.createdAt).toBe(mergedCreatedAt)
})

test('rejects an empty benchmark output collection through the schema', async () => {
  await expect(
    mergeBenchmarkOutputFiles({
      host: VirtualHost.create(),
      outputs: [],
      outputDirectory: '/results',
    }),
  ).rejects.toMatchObject({
    issues: [
      {
        path: [],
        message: 'Cannot merge benchmark output files: no outputs provided',
      },
    ],
  })
})

test.each(['capabilities', 'scenarios', 'treatments'] as const)(
  'rejects benchmark %s metadata whose ID differs from its manifest key',
  field => {
    const output = createOutputFile()
    if (field === 'capabilities') {
      output.capabilities.components.id = 'wrong'
    } else if (field === 'scenarios') {
      output.scenarios.example.id = 'wrong'
    } else {
      output.treatments.control.id = 'wrong'
    }
    const id = field === 'capabilities' ? 'components' : field === 'scenarios' ? 'example' : 'control'

    const result = BenchmarkOutputFileSchema.safeParse(output)

    expect(result).toMatchObject({
      success: false,
      error: {
        issues: [
          {
            path: [field, id, 'id'],
          },
        ],
      },
    })
  },
)

test('rejects duplicate scenario IDs within benchmark output capabilities', () => {
  const output = createOutputFile()
  output.capabilities.components.scenarioIds.push('example')

  const result = BenchmarkOutputFileSchema.safeParse(output)

  expect(result).toMatchObject({
    success: false,
    error: {
      issues: [
        {
          path: ['capabilities', 'components', 'scenarioIds'],
          message: 'Scenario IDs must be unique within a capability',
        },
      ],
    },
  })
})

test('rejects duplicate benchmark output trial IDs before reading artifacts', async () => {
  await expect(
    mergeBenchmarkOutputFiles({
      host: VirtualHost.create(),
      outputs: [
        createOutputFile({
          duplicate: 'missing-first.json',
        }),
        createOutputFile({
          duplicate: 'missing-second.json',
        }),
      ],
      outputDirectory: '/results',
    }),
  ).rejects.toMatchObject({
    issues: [
      {
        path: [1, 'trials', 'duplicate'],
        message: 'Cannot merge benchmark output files: duplicate trial ID found: duplicate',
      },
    ],
  })
})

test.each(['capabilities', 'scenarios', 'treatments'] as const)(
  'rejects conflicting benchmark %s metadata before reading artifacts',
  async field => {
    const first = createOutputFile({
      trial: 'missing.json',
    })
    const second = createOutputFile()
    if (field === 'capabilities') {
      second.capabilities.components.name = 'Other components'
    } else if (field === 'scenarios') {
      second.scenarios.example.prompt = 'A different task'
    } else {
      second.treatments.control.name = 'A different treatment'
    }
    const type = field === 'capabilities' ? 'capability' : field === 'scenarios' ? 'scenario' : 'treatment'
    const id = field === 'capabilities' ? 'components' : field === 'scenarios' ? 'example' : 'control'

    await expect(
      mergeBenchmarkOutputFiles({
        host: VirtualHost.create(),
        outputs: [first, second],
        outputDirectory: '/results',
      }),
    ).rejects.toMatchObject({
      issues: [
        {
          path: [1, field, id],
          message: `Cannot merge conflicting ${type} metadata for id: ${id}`,
        },
      ],
    })
  },
)

test('merges compatible benchmark shards with repeated metadata and distinct trials', async () => {
  const host = VirtualHost.create({
    '/results/first.json': JSON.stringify(trial),
    '/results/second.json': JSON.stringify({
      ...trial,
      id: 'second',
    }),
  })
  const first = createOutputFile({
    trial: 'first.json',
  })
  const second = createOutputFile({
    second: 'second.json',
  })
  first.capabilities.components.scenarioIds.push('other')
  second.capabilities.components.scenarioIds.push('other')

  const output = await mergeBenchmarkOutputFiles({
    host,
    outputs: [first, second],
    outputDirectory: '/results',
  })

  expect(output.id).toBe('example')
  expect([...output.trials.keys()]).toEqual(['trial', 'second'])
  expect(output.capabilities.size).toBe(1)
  expect(output.capabilities.get('components')?.scenarioIds).toEqual(['example', 'other'])
  expect(output.scenarios.size).toBe(1)
  expect(output.treatments.size).toBe(1)
  expect(output.trials.get('trial')?.createdAt).toBe(trial.createdAt)
})
