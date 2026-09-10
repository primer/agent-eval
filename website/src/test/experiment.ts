import type {Run, RunOutputResult} from '../runs'

export function createResult(overrides: Partial<RunOutputResult> = {}): RunOutputResult {
  return {
    id: 'trial-1',
    treatmentId: 'control',
    model: 'gpt-5.6-sol',
    reasoningEffort: 'medium',
    scenarioId: 'scenario-a',
    assistant: {
      logs: [],
      turns: 1,
      outputTokens: 100,
      premiumRequests: 1,
      totalApiDurationMs: 1000,
      sessionDurationMs: 2000,
      tools: {},
    },
    testResults: {
      numTotalTests: 4,
      numPassedTests: 3,
      numFailedTests: 1,
      numPendingTests: 0,
      numTodoTests: 0,
      success: false,
      testResults: [],
      tests: [],
    },
    walkthrough: {type: 'Unavailable'},
    judges: [],
    ...overrides,
  }
}

export function createRun(results: Array<RunOutputResult> = [createResult()], date = '2026-09-10'): Run {
  return {
    id: date,
    name: date,
    date: new Date(`${date}T00:00:00.000Z`),
    directory: `/results/experiments/example/${date}`,
    output: {
      experiment: {id: 'example', models: []},
      scenarios: ['scenario-b', 'scenario-a'].map(id => {
        return {
          id,
          directory: `/scenarios/${id}`,
          prompt: 'Build a page',
          tags: [],
          judges: [],
          testPath: `/scenarios/${id}/scenario.test.ts`,
        }
      }),
      treatments: [
        {id: 'control', config: {name: 'Control'}},
        {id: 'skill', config: {name: 'With skill'}},
      ],
      results,
    },
  }
}
