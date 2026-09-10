import type {ExperimentOutput} from '@primer/agent-eval/experiment'
import {expect, test} from 'vitest'
import {createBenchmarkRunDetails, createExperimentRunDetails} from './run-details'
import {normalizeOutput, type RunOutputResult} from './runs'

const session = {
  turns: 2,
  outputTokens: 100,
  premiumRequests: 1,
  totalApiDurationMs: 200,
  sessionDurationMs: 300,
  tools: {},
  messages: [],
}

const config = {
  name: 'empty-state-copy',
  description: 'Evaluate the empty state.',
  judge: {instructions: 'Inspect the user-facing copy.'},
  scores: [
    {value: 0, description: 'The copy is clear.'},
    {value: 10, description: 'The copy needs work.'},
  ],
}

const judges: RunOutputResult['judges'] = [
  {
    config,
    result: {
      type: 'result',
      score: 0,
      rationale: 'The heading and description encourage creating a project.',
      findings: [
        {
          filepath: 'src/App.tsx',
          snippet: '<h1>No projects yet</h1>',
          explanation: 'The heading explains the empty state.',
        },
      ],
    },
    agent: {session},
  },
  {
    config: {...config, name: 'failed-judge'},
    result: {type: 'error', message: 'Invalid judge report JSON'},
    agent: {session},
  },
  {
    config: {...config, name: 'missing-judge'},
    result: {type: 'unknown'},
    agent: {session},
  },
]

function createOutput(judgeOutputs = judges): ExperimentOutput {
  return {
    experimentId: 'test-experiment',
    scenarios: new Map(),
    treatments: new Map([['control', {name: 'Control'}]]),
    trials: new Map([
      [
        'trial-1',
        {
          id: 'trial-1',
          model: {name: 'gpt-5.6-sol', reasoningEffort: 'medium'},
          scenarioId: 'empty-state',
          treatmentId: 'control',
          agent: {sessions: [session]},
          artifacts: {
            directory: 'artifacts/trial-1',
            copilotConfigDirectory: 'artifacts/trial-1/copilot',
            skillsConfigDirectory: 'artifacts/trial-1/skills',
            testResultsPath: 'artifacts/trial-1/tests.json',
            workspaceDirectory: 'artifacts/trial-1/workspace',
          },
          testResults: {
            numTotalTests: 1,
            numPassedTests: 1,
            numFailedTests: 0,
            numPendingTests: 0,
            numTodoTests: 0,
            success: true,
            testResults: [
              {
                assertionResults: [
                  {
                    title: 'renders',
                    fullName: 'empty state renders',
                    status: 'passed',
                    meta: {description: 'Renders an empty state'},
                  },
                ],
              },
            ],
          },
          walkthrough: {type: 'Unavailable'},
          judges: judgeOutputs,
        },
      ],
    ]),
  }
}

test.each([
  {name: 'scored, error, and unknown results', judges},
  {name: 'no judges', judges: []},
])('preserves $name through experiment normalization and run details', async ({judges: judgeOutputs}) => {
  const output = normalizeOutput(createOutput(judgeOutputs))
  expect(output.results[0].judges).toEqual(judgeOutputs)

  const details = await createExperimentRunDetails('2026-09-09', output, '/results/experiment')
  expect(details.results[0]).toMatchObject({
    treatment: 'Control',
    testsPassed: 1,
    totalTests: 1,
    turns: 2,
    transcript: [],
    walkthrough: {type: 'Unavailable'},
    judges: judgeOutputs.map(judge => {
      return {config: judge.config, result: judge.result}
    }),
  })
  for (const judge of details.results[0].judges) {
    expect(judge).not.toHaveProperty('agent')
  }
})

test.each([
  {name: 'scored, error, and unknown results', judges},
  {name: 'no judges', judges: []},
])('preserves $name in benchmark run details', async ({judges: judgeOutputs}) => {
  const output = createOutput(judgeOutputs)
  const details = await createBenchmarkRunDetails({
    id: '2026-09-09',
    name: '2026-09-09',
    date: new Date('2026-09-09'),
    directory: '/results/benchmark',
    output: {
      benchmarkId: 'test-benchmark',
      capabilities: new Map(),
      scenarios: output.scenarios,
      treatments: output.treatments,
      trials: new Map(
        [...output.trials].map(([id, trial]) => {
          return [id, {...trial, capabilityId: 'copy'}]
        }),
      ),
    },
  })

  const experimentDetails = await createExperimentRunDetails(
    '2026-09-09',
    normalizeOutput(output),
    '/results/experiment',
  )
  expect(details.results).toEqual(
    experimentDetails.results.map(result => {
      return {...result, context: 'copy'}
    }),
  )
})
