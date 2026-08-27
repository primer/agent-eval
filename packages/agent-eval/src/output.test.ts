import {describe, expect, test} from 'vitest'
import {
  createAgentEvalOutput,
  parseAgentEvalOutput,
  type AgentEvalOutput,
  type ExperimentConfig,
  type ResolvedScenario,
  type TreatmentResult,
} from './index'

const output: AgentEvalOutput = {
  id: 'run-id',
  experiment: {
    id: 'example',
    name: 'Example',
    description: 'An example experiment',
    models: [{name: 'gpt-5.5', reasoningEfforts: ['high']}],
    scenarios: ['example'],
  },
  scenarios: [
    {
      id: 'example',
      directory: '/scenarios/example',
      config: {
        description: 'Evaluate whether the agent builds an example',
        prompt: 'Build an example',
      },
      testPath: '/scenarios/example/scenario.test.ts',
      browserTestPath: '/scenarios/example/scenario.browser.test.ts',
    },
  ],
  treatments: [
    {
      id: 'treatment-id',
      config: {
        name: 'Control',
      },
    },
  ],
  results: [
    {
      id: 'result-id',
      treatmentId: 'treatment-id',
      model: 'gpt-5.5',
      reasoningEffort: 'high',
      scenarioId: 'example',
      artifacts: {
        copilotConfigPath: '/artifacts/.copilot',
        directory: '/artifacts',
        skillsConfigPath: '/artifacts/.agents',
        testResultsPath: '/artifacts/workspace/test-results.json',
        workspacePath: '/artifacts/workspace',
      },
      assistant: {
        logs: [],
        turns: 1,
        outputTokens: 100,
        premiumRequests: 1,
        totalNanoAiu: 2_839_800_000,
        totalApiDurationMs: 1000,
        sessionDurationMs: 2000,
        tools: {
          view: 1,
        },
      },
      testResults: {
        numTotalTests: 1,
        numPassedTests: 1,
        numFailedTests: 0,
        numPendingTests: 0,
        numTodoTests: 0,
        tests: [
          {
            title: 'renders an example',
            fullName: 'example > renders an example',
            status: 'passed',
          },
        ],
      },
      walkthrough: {
        type: 'Unavailable',
      },
    },
  ],
}

describe(createAgentEvalOutput, () => {
  test('deduplicates experiment, scenario, and treatment metadata', () => {
    const experiment: ExperimentConfig = {
      name: 'Example',
      description: 'An example experiment',
      models: [{name: 'gpt-5.5', reasoningEfforts: ['high']}],
      scenarios: ['example'],
      treatments: [],
    }
    const scenario: ResolvedScenario = output.scenarios[0]
    const result: TreatmentResult = {
      ...output.results[0],
      assistant: {
        ...output.results[0].assistant,
        totalNanoAiu: 2_839_800_000,
      },
      treatment: {
        config: {
          name: 'Control',
        },
        scenario,
        experiment,
        id: 'treatment-id',
        model: 'gpt-5.5',
        reasoningEffort: 'high',
      },
    }
    const duplicateTreatmentResult: TreatmentResult = {
      ...result,
      id: 'second-result-id',
      treatment: {
        ...result.treatment,
        id: 'second-treatment-id',
      },
    }

    expect(
      createAgentEvalOutput({
        id: 'run-id',
        experimentId: 'example',
        experiment,
        scenarios: [scenario],
        results: [result, duplicateTreatmentResult],
      }),
    ).toEqual({
      ...output,
      results: [
        output.results[0],
        {
          ...output.results[0],
          id: 'second-result-id',
        },
      ],
    })
  })
})

describe(parseAgentEvalOutput, () => {
  test('parses agent eval output', () => {
    expect(parseAgentEvalOutput(output)).toEqual(output)
  })

  test('parses serialized agent eval output', () => {
    expect(parseAgentEvalOutput(JSON.stringify(output))).toEqual(output)
  })

  test('parses output created before totalNanoAiu was supported', () => {
    const legacyOutput = structuredClone(output)
    delete legacyOutput.results[0].assistant.totalNanoAiu

    expect(parseAgentEvalOutput(legacyOutput)).toEqual(legacyOutput)
  })

  test('preserves unknown Copilot messages', () => {
    const unknownMessage = {
      type: 'unknown.event',
      data: {
        nested: {
          value: 42,
        },
      },
      metadata: ['one', 'two'],
    }
    const outputWithUnknownMessage = {
      ...output,
      results: [
        {
          ...output.results[0],
          assistant: {
            ...output.results[0].assistant,
            logs: [unknownMessage],
          },
        },
      ],
    }

    expect(parseAgentEvalOutput(outputWithUnknownMessage)).toEqual(outputWithUnknownMessage)
  })

  test('defaults the walkthrough for results without one', () => {
    const {walkthrough, ...resultWithoutWalkthrough} = output.results[0]

    expect(walkthrough).toEqual({type: 'Unavailable'})
    expect(
      parseAgentEvalOutput({
        ...output,
        results: [resultWithoutWalkthrough],
      }),
    ).toEqual(output)
  })

  test('throws for invalid agent eval output', () => {
    expect(() =>
      parseAgentEvalOutput({
        ...output,
        results: [
          {
            ...output.results[0],
            testResults: {
              ...output.results[0].testResults,
              tests: [{title: 'invalid', fullName: 'invalid', status: 'unknown'}],
            },
          },
        ],
      }),
    ).toThrow()
  })

  test('throws for an invalid reasoning effort', () => {
    expect(() =>
      parseAgentEvalOutput({
        ...output,
        results: [
          {
            ...output.results[0],
            reasoningEffort: 'invalid',
          },
        ],
      }),
    ).toThrow()
  })

  test('throws for an unknown treatment reference', () => {
    expect(() =>
      parseAgentEvalOutput({
        ...output,
        results: [
          {
            ...output.results[0],
            treatmentId: 'unknown',
          },
        ],
      }),
    ).toThrow('references unknown treatment')
  })

  test('throws for duplicate treatment IDs', () => {
    expect(() =>
      parseAgentEvalOutput({
        ...output,
        treatments: [...output.treatments, output.treatments[0]],
      }),
    ).toThrow('Treatment IDs must be unique')
  })
})
