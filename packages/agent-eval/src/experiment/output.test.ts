import {expect, expectTypeOf, test} from 'vitest'
import type {CopilotRunner} from '../copilot-runner'
import {VirtualHost} from '../host'
import {RunTrialResultSchema} from '../trial/run'
import {getExperiment} from './get'
import {createExperimentPlan} from './plan'
import {
  ExperimentOutputFileSchema,
  ExperimentTrialOutputSchema,
  createExperimentOutput,
  listExperimentOutputFiles,
  mergeExperimentOutputFiles,
  parseExperimentTrialOutput,
  writeExperimentOutput,
  type ExperimentTrialOutput,
} from './output'

const trial = {
  id: 'trial',
  model: {
    name: 'gpt-5.5',
    reasoningEffort: 'medium',
  },
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

test('parses legacy experiment output with a required CLI runner', () => {
  const parsed = ExperimentTrialOutputSchema.parse(trial)

  expect(parsed.runner).toBe('copilot-cli')
  expectTypeOf<ExperimentTrialOutput['runner']>().toEqualTypeOf<CopilotRunner>()
})

test.each(['copilot-cli', 'copilot-sdk'] as const)('preserves the explicit %s experiment output runner', runner => {
  const parsed = ExperimentTrialOutputSchema.parse({
    ...trial,
    runner,
  })

  expect(parsed.runner).toBe(runner)
})

test.each([null, 'unknown'])('rejects an invalid experiment output runner: %s', runner => {
  expect(() => {
    ExperimentTrialOutputSchema.parse({
      ...trial,
      runner,
    })
  }).toThrow()
})

function createOutputFile(trials: Record<string, string> = {}) {
  return {
    id: 'example',
    capabilities: {},
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

test('rejects an empty experiment output collection through the schema', async () => {
  await expect(
    mergeExperimentOutputFiles({
      host: VirtualHost.create(),
      outputs: [],
      outputDirectory: '/results',
    }),
  ).rejects.toMatchObject({
    issues: [
      {
        path: [],
        message: 'Cannot merge experiment output files: no outputs provided',
      },
    ],
  })
})

test.each(['scenarios', 'treatments'] as const)(
  'rejects experiment %s metadata whose ID differs from its manifest key',
  field => {
    const output = createOutputFile()
    if (field === 'scenarios') {
      output.scenarios.example.id = 'wrong'
    } else {
      output.treatments.control.id = 'wrong'
    }

    const result = ExperimentOutputFileSchema.safeParse(output)

    expect(result).toMatchObject({
      success: false,
      error: {
        issues: [
          {
            path: [field, field === 'scenarios' ? 'example' : 'control', 'id'],
          },
        ],
      },
    })
  },
)

test('rejects duplicate experiment output trial IDs before reading artifacts', async () => {
  const host = VirtualHost.create()

  await expect(
    mergeExperimentOutputFiles({
      host,
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
        message: 'Cannot merge experiment output files: duplicate trial ID found: duplicate',
      },
    ],
  })
})

test('rejects mismatched experiment output IDs before reading artifacts', async () => {
  const first = createOutputFile({
    trial: 'missing.json',
  })
  const second = createOutputFile()
  second.id = 'other'

  await expect(
    mergeExperimentOutputFiles({
      host: VirtualHost.create(),
      outputs: [first, second],
      outputDirectory: '/results',
    }),
  ).rejects.toMatchObject({
    issues: [
      {
        path: [1, 'id'],
        message: 'Cannot merge experiment output files: mismatched experiment IDs (example !== other)',
      },
    ],
  })
})

test.each(['scenarios', 'treatments'] as const)(
  'rejects conflicting experiment %s metadata before reading artifacts',
  async field => {
    const first = createOutputFile({
      trial: 'missing.json',
    })
    const second = createOutputFile()
    if (field === 'scenarios') {
      second.scenarios.example.prompt = 'A different task'
    } else {
      second.treatments.control.name = 'A different treatment'
    }
    const type = field === 'scenarios' ? 'scenario' : 'treatment'
    const id = field === 'scenarios' ? 'example' : 'control'

    await expect(
      mergeExperimentOutputFiles({
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

test('reports independent experiment manifest conflicts together', async () => {
  const first = createOutputFile({
    duplicate: 'missing-first.json',
  })
  const second = createOutputFile({
    duplicate: 'missing-second.json',
  })
  second.id = 'other'
  second.treatments.control.name = 'A different treatment'

  await expect(
    mergeExperimentOutputFiles({
      host: VirtualHost.create(),
      outputs: [first, second],
      outputDirectory: '/results',
    }),
  ).rejects.toMatchObject({
    issues: [
      {
        path: [1, 'id'],
      },
      {
        path: [1, 'treatments', 'control'],
      },
      {
        path: [1, 'trials', 'duplicate'],
      },
    ],
  })
})

test('merges compatible experiment shards with repeated metadata and distinct trials', async () => {
  const host = VirtualHost.create({
    '/results/first.json': JSON.stringify(trial),
    '/results/second.json': JSON.stringify({
      ...trial,
      id: 'second',
    }),
  })

  const output = await mergeExperimentOutputFiles({
    host,
    outputs: [
      createOutputFile({
        trial: 'first.json',
      }),
      createOutputFile({
        second: 'second.json',
      }),
    ],
    outputDirectory: '/results',
  })

  expect(output.id).toBe('example')
  expect([...output.trials.keys()]).toEqual(['trial', 'second'])
  expect(output.scenarios.size).toBe(1)
  expect(output.treatments.size).toBe(1)
})

test('preserves benchmark capabilities and trial membership through writing and merging shards', async () => {
  const host = VirtualHost.create({
    '/experiments/example.ts':
      'export default {name: "Example", description: "Compare a benchmark", models: ["gpt-5.5"], benchmark: "example", treatments: []}',
    '/benchmarks/example.ts':
      'export default {name: "Example", description: "Shared scenarios", models: ["gpt-5.5"], capabilities: [{name: "Components", scenarios: ["example"]}, {name: "Layout", scenarios: ["example"]}]}',
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {prompt: "Build a page"}',
  })
  const experiment = await getExperiment({
    host,
    name: 'example',
    experimentsDirectory: '/experiments',
    benchmarksDirectory: '/benchmarks',
    scenariosDirectory: '/scenarios',
  })
  const plan = createExperimentPlan({experiment})
  const results = plan.trials.map(entry => {
    return {
      trial: entry,
      result: RunTrialResultSchema.parse({
        ...trial,
        trial: entry,
        artifacts: {
          ...trial.artifacts,
          directory: `/results/artifacts/${entry.id}`,
        },
      }),
    }
  })
  const expected = createExperimentOutput({experiment, runPlanResult: {results}})

  for (const [index, shard] of [results.slice(0, 2), results.slice(2)].entries()) {
    await writeExperimentOutput({
      host,
      output: createExperimentOutput({experiment, runPlanResult: {results: shard}}),
      outputPath: `/results/output-${index + 1}.json`,
    })
  }
  const files = await listExperimentOutputFiles({host, outputDirectory: '/results'})
  const merged = await mergeExperimentOutputFiles({
    host,
    outputDirectory: '/results',
    outputs: files.map(([output]) => {
      return output
    }),
  })

  expect(merged).toEqual(expected)
  expect(
    [...merged.capabilities.values()]
      .map(capability => {
        return capability.name
      })
      .sort(),
  ).toEqual(['Components', 'Layout'])
  expect(
    [...merged.trials.values()].every(entry => {
      return entry.capabilityId !== undefined && merged.capabilities.has(entry.capabilityId)
    }),
  ).toBe(true)
})

test('defaults legacy scenario manifests to no capabilities', () => {
  const legacy: Record<string, unknown> = createOutputFile()
  delete legacy.capabilities

  expect(ExperimentOutputFileSchema.parse(legacy).capabilities).toEqual({})
})

test.each([
  {capabilityId: undefined, scenarioId: 'example'},
  {capabilityId: 'unknown', scenarioId: 'example'},
  {capabilityId: 'components', scenarioId: 'wrong-scenario'},
])('rejects invalid benchmark experiment capability membership: %j', fields => {
  expect(() => {
    parseExperimentTrialOutput(
      {...trial, ...fields},
      new Map([['components', {id: 'components', name: 'Components', scenarioIds: ['example']}]]),
    )
  }).toThrow('Invalid capability')
})

test('rejects conflicting capability metadata before reading experiment shard artifacts', async () => {
  const capability = {id: 'components', name: 'Components', scenarioIds: ['example']}

  await expect(
    mergeExperimentOutputFiles({
      host: VirtualHost.create(),
      outputDirectory: '/results',
      outputs: [
        {...createOutputFile({trial: 'missing.json'}), capabilities: {components: capability}},
        {...createOutputFile(), capabilities: {components: {...capability, name: 'Renamed'}}},
      ],
    }),
  ).rejects.toMatchObject({
    issues: [{path: [1, 'capabilities', 'components']}],
  })
})
