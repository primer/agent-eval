import {describe, expect, test} from 'vitest'
import {parseAgentEvalOutput, type AgentEvalOutput} from './index'

const output: AgentEvalOutput = {
  id: 'run-id',
  experimentId: 'example',
  results: [
    {
      id: 'result-id',
      treatment: {
        config: {
          name: 'Control',
        },
        scenario: {
          id: 'example',
          directory: '/scenarios/example',
          config: {
            prompt: 'Build an example',
          },
          testPath: '/scenarios/example/scenario.test.ts',
        },
        experiment: {
          name: 'Example',
          description: 'An example experiment',
          models: ['gpt-5.5'],
          scenarios: ['example'],
          treatments: [],
        },
        id: 'treatment-id',
        model: 'gpt-5.5',
      },
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
    },
  ],
}

describe(parseAgentEvalOutput, () => {
  test('parses agent eval output', () => {
    expect(parseAgentEvalOutput(output)).toEqual(output)
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
})
