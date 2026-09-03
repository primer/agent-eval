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
      name: 'Migration',
      scenarios: [
        {
          id: 'migrate-component',
          directory: '/scenarios/migrate-component',
          prompt: 'Complete the task',
          tags: [],
          testPath: '/scenarios/migrate-component/scenario.test.ts',
        },
      ],
    },
    {
      name: 'Authoring',
      scenarios: [
        {
          id: 'create-component',
          directory: '/scenarios/create-component',
          prompt: 'Complete the task',
          tags: [],
          testPath: '/scenarios/create-component/scenario.test.ts',
        },
      ],
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
        ],
      }),
      capability: capabilities[1],
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
        sessions: [
          {
            turns: 1,
            outputTokens: 800,
            premiumRequests: 2,
            totalApiDurationMs: 20_000,
            sessionDurationMs: 35_000,
            tools: {},
            messages: [],
          },
        ],
      }),
      capability: capabilities[1],
    },
    {
      ...createResult({
        treatment: 'Control',
        scenario: 'create-component',
        model: {
          name: 'claude-sonnet-5',
          reasoningEffort: 'high',
        },
        numPassedTests: 0,
        numTotalTests: 2,
        sessions: [
          {
            turns: 1,
            outputTokens: 700,
            premiumRequests: 1,
            totalApiDurationMs: 20_000,
            sessionDurationMs: 30_000,
            tools: {},
            messages: [],
          },
        ],
      }),
      capability: capabilities[1],
    },
    {
      ...createResult({
        treatment: 'Benchmark',
        scenario: 'create-component',
        model: {
          name: 'claude-sonnet-5',
          reasoningEffort: 'high',
        },
        numPassedTests: 0,
        numTotalTests: 2,
        sessions: [
          {
            turns: 1,
            outputTokens: 700,
            premiumRequests: 1,
            totalApiDurationMs: 15_000,
            sessionDurationMs: 25_000,
            tools: {},
            messages: [],
          },
        ],
      }),
      capability: capabilities[1],
    },
    {
      ...createResult({
        treatment: 'Control',
        scenario: 'migrate-component',
        model: {
          name: 'claude-sonnet-5',
          reasoningEffort: 'high',
        },
        numPassedTests: 2,
        numTotalTests: 2,
        sessions: [
          {
            turns: 2,
            outputTokens: 900,
            premiumRequests: 2,
            totalApiDurationMs: 40_000,
            sessionDurationMs: 60_000,
            tools: {},
            messages: [],
          },
        ],
      }),
      capability: capabilities[0],
    },
    {
      ...createResult({
        treatment: 'Benchmark',
        scenario: 'migrate-component',
        model: {
          name: 'claude-sonnet-5',
          reasoningEffort: 'high',
        },
        numPassedTests: 1,
        numTotalTests: 2,
        sessions: [
          {
            turns: 3,
            outputTokens: 1_100,
            premiumRequests: 3,
            totalApiDurationMs: 50_000,
            sessionDurationMs: 75_000,
            tools: {},
            messages: [],
          },
        ],
      }),
      capability: capabilities[0],
    },
  ]

  const formatted = formatBenchmarkResults(
    {
      name: 'Design system',
      capabilities,
    },
    results,
  )
    .split('\n')
    .map(line => {
      return line.trimEnd()
    })
    .join('\n')

  expect(formatted).toMatchInlineSnapshot(`
    "Benchmark      Capability  Scenario             Model                Reasoning Effort  Tests          Output Tokens   Premium Requests  Session Time       API Time
    -------------  ----------  -------------------  -------------------  ----------------  -------------  --------------  ----------------  -----------------  --------------
    Design system  Migration   All scenarios        All models                             1/2 (-50.0%)   1,100 (+22.2%)  3 (+50.0%)        1m 15.0s (+25.0%)  50.0s (+25.0%)
                                 migrate-component  All models                             1/2 (-50.0%)   1,100 (+22.2%)  3 (+50.0%)        1m 15.0s (+25.0%)  50.0s (+25.0%)
                                                        claude-sonnet-5  high              1/2 (-50.0%)   1,100 (+22.2%)  3 (+50.0%)        1m 15.0s (+25.0%)  50.0s (+25.0%)
    Design system  Authoring   All scenarios        All models                             2/4 (+100.0%)  1,500 (-11.8%)  3 (+50.0%)        1m 0.0s (-20.0%)   35.0s (-30.0%)
                                 create-component   All models                             2/4 (+100.0%)  1,500 (-11.8%)  3 (+50.0%)        1m 0.0s (-20.0%)   35.0s (-30.0%)
                                                        gpt-5.6-sol      medium            2/2 (+100.0%)  800 (-20.0%)    2 (+100.0%)       35.0s (-22.2%)     20.0s (-33.3%)
                                                        claude-sonnet-5  high              0/2 (0.0%)     700 (0.0%)      1 (0.0%)          25.0s (-16.7%)     15.0s (-25.0%)"
  `)
})
