import {expect, test} from 'vitest'
import type {BenchmarkTrialResult, Capability} from './benchmark'
import type {TrialResult} from './trial'
import {formatBenchmarkResults, formatExperimentResults} from './report'

function createResult({
  treatment,
  scenario,
  model,
  numPassedTests,
  numTotalTests,
  sessions,
}: {
  treatment: string
  scenario: string
  model: TrialResult['trial']['model']
  numPassedTests: number
  numTotalTests: number
  sessions: TrialResult['agent']['sessions']
}): TrialResult {
  return {
    artifacts: {
      directory: '/artifacts/trial',
      copilotConfigDirectory: '/artifacts/trial/.copilot',
      skillsConfigDirectory: '/artifacts/trial/.agents',
      testResultsPath: '/artifacts/trial/workspace/test-results.json',
      workspaceDirectory: '/artifacts/trial/workspace',
    },
    trial: {
      id: `${treatment}-${scenario}-${model.name}-${model.reasoningEffort}`,
      scenario: {
        id: scenario,
        directory: `/scenarios/${scenario}`,
        prompt: 'Complete the task',
        tags: [],
        testPath: `/scenarios/${scenario}/scenario.test.ts`,
      },
      treatment: {
        name: treatment,
      },
      model,
    },
    agent: {
      sessions,
    },
    testResults: {
      numTotalTests,
      numPassedTests,
      numFailedTests: numTotalTests - numPassedTests,
      numPendingTests: 0,
      numTodoTests: 0,
      success: numPassedTests === numTotalTests,
      testResults: [],
    },
    walkthrough: {
      type: 'Unavailable',
    },
  }
}

test('formats trial results as an aggregated hierarchy', () => {
  const results = [
    createResult({
      treatment: 'Control',
      scenario: 'button',
      model: {
        name: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
      },
      numPassedTests: 1,
      numTotalTests: 2,
      sessions: [
        {
          turns: 2,
          outputTokens: 1_000,
          premiumRequests: 1,
          totalApiDurationMs: 30_000,
          sessionDurationMs: 45_000,
          tools: {},
          messages: [],
        },
        {
          turns: 1,
          outputTokens: 250,
          premiumRequests: 2,
          totalApiDurationMs: 5_000,
          sessionDurationMs: 10_000,
          tools: {},
          messages: [],
        },
      ],
    }),
    createResult({
      treatment: 'Recommended',
      scenario: 'button',
      model: {
        name: 'claude-sonnet-5',
        reasoningEffort: 'high',
      },
      numPassedTests: 2,
      numTotalTests: 2,
      sessions: [
        {
          turns: 1,
          outputTokens: 900,
          premiumRequests: 1,
          totalApiDurationMs: 65_000,
          sessionDurationMs: 90_000,
          tools: {},
          messages: [],
        },
      ],
    }),
  ]

  expect(formatExperimentResults('Design system', results)).toMatchInlineSnapshot(`
    "Experiment     Treatment    Scenario       Model                Reasoning Effort  Success Rate  Tests  Runs  Output Tokens  Premium Requests  Session Time  API Time
    -------------  -----------  -------------  -------------------  ----------------  ------------  -----  ----  -------------  ----------------  ------------  --------
    Design system  Recommended  All scenarios  All models                             100.0%        2/2    1     900            1                 1m 30.0s      1m 5.0s 
                                  button       All models                             100.0%        2/2    1     900            1                 1m 30.0s      1m 5.0s 
                                                   claude-sonnet-5  high              100.0%        2/2    1     900            1                 1m 30.0s      1m 5.0s 
    Design system  Control      All scenarios  All models                             50.0%         1/2    1     1,250          3                 55.0s         35.0s   
                                  button       All models                             50.0%         1/2    1     1,250          3                 55.0s         35.0s   
                                                   gpt-5.6-sol      medium            50.0%         1/2    1     1,250          3                 55.0s         35.0s   "
  `)
})

test('formats benchmark results as capability comparisons by scenario', () => {
  const capabilities: Array<Capability> = [
    {
      name: 'Authoring',
      scenarios: [],
    },
    {
      name: 'Migration',
      scenarios: [],
    },
  ]
  const results: Array<BenchmarkTrialResult> = [
    {
      ...createResult({
        treatment: 'Control',
        scenario: 'create-component',
        model: {
          name: 'gpt-5.6-sol',
          reasoningEffort: 'medium',
        },
        numPassedTests: 1,
        numTotalTests: 2,
        sessions: [],
      }),
      capability: capabilities[0],
    },
    {
      ...createResult({
        treatment: 'Benchmark',
        scenario: 'create-component',
        model: {
          name: 'gpt-5.6-sol',
          reasoningEffort: 'medium',
        },
        numPassedTests: 2,
        numTotalTests: 2,
        sessions: [],
      }),
      capability: capabilities[0],
    },
    {
      ...createResult({
        treatment: 'Control',
        scenario: 'migrate-component',
        model: {
          name: 'gpt-5.6-sol',
          reasoningEffort: 'medium',
        },
        numPassedTests: 2,
        numTotalTests: 2,
        sessions: [],
      }),
      capability: capabilities[1],
    },
    {
      ...createResult({
        treatment: 'Benchmark',
        scenario: 'migrate-component',
        model: {
          name: 'gpt-5.6-sol',
          reasoningEffort: 'medium',
        },
        numPassedTests: 1,
        numTotalTests: 2,
        sessions: [],
      }),
      capability: capabilities[1],
    },
  ]

  const formatted = formatBenchmarkResults('Design system', results)
    .split('\n')
    .map(line => {
      return line.trimEnd()
    })
    .join('\n')

  expect(formatted).toMatchInlineSnapshot(`
    "Benchmark      Capability  Scenario             Control  With benchmark  Delta     Control tests  Benchmark tests
    -------------  ----------  -------------------  -------  --------------  --------  -------------  ---------------
    Design system  Authoring   All scenarios        50.0%    100.0%          +50.0 pp  1/2            2/2
                                 create-component   50.0%    100.0%          +50.0 pp  1/2            2/2
    Design system  Migration   All scenarios        100.0%   50.0%           -50.0 pp  2/2            1/2
                                 migrate-component  100.0%   50.0%           -50.0 pp  2/2            1/2"
  `)
})
