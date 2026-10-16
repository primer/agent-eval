import {expect, expectTypeOf, test} from 'vitest'
import type {CopilotRunner} from '../copilot-runner'
import {VirtualHost} from '../host'
import {
  BenchmarkOutputFileSchema,
  mergeBenchmarkOutputFiles,
  parseBenchmarkTrialOutput,
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
  expectTypeOf<BenchmarkTrialOutput['runner']>().toEqualTypeOf<CopilotRunner>()
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
