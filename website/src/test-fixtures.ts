import type {
  BenchmarkOutput,
  CheckOutput,
  ExperimentOutput,
  ExperimentTrialOutput,
  JudgeOutput,
} from '@primer/agent-eval'

const session: ExperimentTrialOutput['agent']['sessions'][number] = {
  turns: 2,
  outputTokens: 100,
  premiumRequests: 1,
  aiCredits: 0.5,
  totalApiDurationMs: 200,
  sessionDurationMs: 300,
  tools: {},
  messages: [],
}

const judge: JudgeOutput['judge'] = {
  name: 'empty-state-copy',
  description: 'Evaluate the empty state.',
  instructions: 'Inspect the user-facing copy.',
  files: [],
  scores: [
    {value: 0, description: 'The copy is clear.'},
    {value: 10, description: 'The copy needs work.'},
  ],
}

const judges: Array<JudgeOutput> = [
  {
    judge,
    result: {
      type: 'result',
      score: 0,
      rationale: 'The heading encourages creating a project.',
      findings: [
        {filepath: 'src/App.tsx', snippet: '<h1>No projects yet</h1>', explanation: 'Explains the empty state.'},
      ],
    },
    agent: {session: {...session, outputTokens: 9000}},
  },
  {
    judge: {...judge, name: 'failed-judge'},
    result: {type: 'error', message: 'Invalid judge report JSON'},
    agent: {session},
  },
  {judge: {...judge, name: 'missing-judge'}, result: {type: 'unknown'}, agent: {session}},
]

const checks: Array<CheckOutput> = [
  {
    check: {name: 'tests', description: 'Renders an empty state', files: []},
    result: {
      type: 'outcomes',
      outcomes: [
        {type: 'outcome', id: 'empty state renders', status: 'passed'},
        {type: 'outcome', id: 'keyboard access', status: 'failed'},
        {type: 'outcome', id: 'optional browser', status: 'skipped'},
        {type: 'error', message: 'Browser unavailable'},
      ],
    },
  },
  {
    check: {name: 'performance', files: []},
    result: {
      type: 'measurements',
      id: 'render',
      unit: 'ms',
      direction: 'lower-is-better',
      measurements: [
        {type: 'measurement', value: 10},
        {type: 'measurement', value: 20},
        {type: 'error', message: 'Timeout'},
      ],
    },
  },
]

function createTrial(overrides: Partial<ExperimentTrialOutput> = {}): ExperimentTrialOutput {
  return {
    id: 'trial-1',
    model: {name: 'gpt-5.6-sol', reasoningEffort: 'medium'},
    scenarioId: 'empty-state',
    treatmentId: 'control',
    agent: {sessions: [session]},
    artifacts: {
      directory: 'artifacts/trial-1',
      copilotConfigDirectory: 'artifacts/trial-1/copilot',
      skillsConfigDirectory: 'artifacts/trial-1/skills',
      walkthroughDirectory: 'artifacts/trial-1/walkthrough',
      workspaceDirectory: 'artifacts/trial-1/workspace',
    },
    checks,
    walkthrough: {type: 'Unavailable'},
    judges,
    ...overrides,
  }
}

function createExperimentOutput(trials: Array<ExperimentTrialOutput> = [createTrial()]): ExperimentOutput {
  return {
    id: 'test-experiment',
    scenarios: new Map([
      [
        'empty-state',
        {id: 'empty-state', directory: '/scenarios/empty-state', prompt: 'Create an empty state', tags: [], judges: []},
      ],
    ]),
    treatments: new Map([
      ['control', {id: 'control', name: 'Control'}],
      ['benchmark', {id: 'benchmark', name: 'Benchmark'}],
    ]),
    trials: new Map(
      trials.map(trial => {
        return [trial.id, trial]
      }),
    ),
  }
}

function createBenchmarkOutput(
  trials: Array<ExperimentTrialOutput & {capabilityId?: string}> = [createTrial()],
): BenchmarkOutput {
  return {
    ...createExperimentOutput(trials),
    id: 'test-benchmark',
    trials: new Map(
      trials.map(trial => {
        return [trial.id, {...trial, capabilityId: trial.capabilityId ?? 'a'}]
      }),
    ),
    capabilities: new Map([
      ['a', {id: 'a', name: 'First capability', scenarioIds: ['empty-state']}],
      ['b', {id: 'b', name: 'Overlapping capability', scenarioIds: ['empty-state']}],
    ]),
  }
}

export {checks, createBenchmarkOutput, createExperimentOutput, createTrial, judges, session}
