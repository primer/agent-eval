import {expect, expectTypeOf, test} from 'vitest'
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

test('parses legacy benchmark output with a required CLI runner', () => {
  const parsed = parseBenchmarkTrialOutput(trial, capabilities)

  expect(parsed.runner).toBe('copilot-cli')
  expect(parsed.type).toBe('success')
  expectTypeOf<BenchmarkTrialOutput['runner']>().toEqualTypeOf<CopilotRunner>()
})

test('preserves successful and failed benchmark trials through writing and merging shards', async () => {
  const host = VirtualHost.create({
    '/benchmarks/example.ts':
      'export default {name: "Example", description: "Compare treatments", models: ["gpt-5.5"], capabilities: [{name: "Components", scenarios: ["example"]}]}',
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
  const results = plan.trials.map((entry, index) => {
    return {
      trial: entry,
      result: RunTrialResultSchema.parse(
        index === 0
          ? {
              type: 'error',
              error: {
                name: 'TypeError',
                message: 'Sandbox failed',
              },
            }
          : {
              type: 'success',
              trial: entry,
              agent: trial.agent,
              artifacts: {
                ...trial.artifacts,
                directory: `/results/artifacts/${entry.id}`,
              },
              checks: trial.checks,
              judges: trial.judges,
              walkthrough: trial.walkthrough,
            },
      ),
    }
  })
  const expected = createBenchmarkOutput({benchmark, runPlanResult: {results}})

  for (const [index, result] of results.entries()) {
    await writeBenchmarkOutput({
      host,
      output: createBenchmarkOutput({benchmark, runPlanResult: {results: [result]}}),
      outputPath: `/results/output-${index + 1}.json`,
    })
  }
  const files = await listBenchmarkOutputFiles({host, outputDirectory: '/results'})
  const merged = await mergeBenchmarkOutputFiles({
    host,
    outputDirectory: '/results',
    outputs: files.map(([output]) => {
      return output
    }),
  })

  expect(merged).toEqual(expected)
  const failed = merged.trials.get(results[0].trial.id)
  expect(failed).toMatchObject({
    type: 'error',
    capabilityId: results[0].trial.capability.id,
    error: {name: 'TypeError', message: 'Sandbox failed'},
  })
  expect(failed).not.toHaveProperty('agent')
  expect(failed).not.toHaveProperty('artifacts')
})

test('preserves check annotations and locations in serialized benchmark trial output', () => {
  const checks = [
    {
      check: {name: 'tests', files: []},
      result: {
        type: 'outcomes',
        outcomes: [
          {
            type: 'outcome',
            status: 'failed',
            annotations: [
              {
                context: 'Search tests',
                message: 'filters by name',
                snippet: 'test("filters", ...)',
                location: {
                  path: 'scenario.test.ts',
                  line: 1,
                  column: 1,
                },
              },
            ],
          },
          {
            type: 'error',
            message: 'Could not check file',
            annotations: [{message: 'Missing module', location: {path: 'src/Search.tsx'}}],
          },
        ],
      },
    },
    {
      check: {name: 'size', files: []},
      result: {
        type: 'measurements',
        measurements: [
          {
            type: 'measurement',
            value: 42,
            annotations: [{message: 'Bundle size', location: {path: '/workspace/dist/index.js'}}],
          },
          {
            type: 'error',
            message: 'Could not measure file',
            annotations: [{message: 'Missing output', location: {path: 'dist/missing.js'}}],
          },
        ],
      },
    },
  ]

  const parsed = parseBenchmarkTrialOutput(JSON.parse(JSON.stringify({...trial, checks})), capabilities)

  if (parsed.type !== 'success') {
    throw new Error('Expected successful trial output')
  }
  expect(parsed.checks).toEqual(checks)
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
})
