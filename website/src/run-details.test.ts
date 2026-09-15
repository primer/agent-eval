import {expect, test, vi} from 'vitest'
import {
  createBenchmarkRunDetails,
  createExperimentRunDetails,
  createTrialDetails,
  createTrialTranscript,
  getTrialDataUrl,
} from './run-details'
import {checks, createBenchmarkOutput, createExperimentOutput, createTrial, judges, session} from './test-fixtures'

test.each([
  {name: 'scored, error, and unknown results', judges},
  {name: 'no judges', judges: []},
])('preserves checks and $name in experiment and benchmark details', async ({judges: judgeOutputs}) => {
  const trials = [createTrial({judges: judgeOutputs})]
  const details = await createExperimentRunDetails('2026-09-15', createExperimentOutput(trials))
  const baseUrl = '/run-data/experiments/test-experiment/2026-09-15/trial-1'
  expect(details.results[0]).toEqual({
    id: 'trial-1',
    scenarioId: 'empty-state',
    model: 'gpt-5.6-sol',
    reasoningEffort: 'medium',
    treatment: 'Control',
    checkSummary: '15 ms [1 error]; 50.0% [1 skipped; 1 error]',
    turns: 2,
    outputTokens: 100,
    premiumRequests: 1,
    totalApiDurationMs: 200,
    sessionDurationMs: 300,
    counts: {checks: checks.length, transcript: 0, judges: judgeOutputs.length},
    detailsUrl: `${baseUrl}/details.json`,
    transcriptUrl: `${baseUrl}/transcript.json`,
  })
  const trial = await createTrialDetails(trials[0], '/results/experiment', baseUrl)
  expect(trial).toEqual({
    id: 'trial-1',
    checks,
    walkthrough: {type: 'Unavailable'},
    judges: judgeOutputs.map(output => {
      return {judge: output.judge, result: output.result}
    }),
  })
  for (const output of trial.judges) {
    expect(output).not.toHaveProperty('agent')
  }
  const benchmark = await createBenchmarkRunDetails({
    id: '2026-09-15',
    name: '2026-09-15',
    date: new Date('2026-09-15'),
    directory: '/results/benchmark',
    output: createBenchmarkOutput(trials),
  })
  expect(benchmark).toEqual({
    ...details,
    results: details.results.map(result => {
      return {
        ...result,
        capability: {id: 'a', name: 'First capability'},
        detailsUrl: '/run-data/benchmarks/test-benchmark/2026-09-15/trial-1/details.json',
        transcriptUrl: '/run-data/benchmarks/test-benchmark/2026-09-15/trial-1/transcript.json',
      }
    }),
  })
})

test('keeps repeated trials and session transcripts distinct while aggregating implementation usage', async () => {
  const agentSession = {
    ...session,
    messages: [
      {
        type: 'assistant.message_delta' as const,
        id: 'event-1',
        timestamp: '2026-09-15T00:00:00.000Z',
        parentId: '',
        ephemeral: true,
        data: {messageId: 'message-1', deltaContent: 'Hello'},
      },
    ],
  }
  const output = createExperimentOutput([
    createTrial({agent: {sessions: [agentSession, agentSession]}}),
    createTrial({id: 'trial-2'}),
  ])
  const details = await createExperimentRunDetails('2026-09-15', output)
  expect(details.results).toHaveLength(2)
  expect(details.results[0]).toMatchObject({turns: 4, outputTokens: 200, premiumRequests: 2})
  expect(details.results[0].counts.transcript).toBe(2)
  expect(details.results[0]).not.toHaveProperty('transcript')
  expect(createTrialTranscript([...output.trials.values()][0])).toEqual([
    {id: '0:event-1', label: 'Assistant', timestamp: '2026-09-15T00:00:00.000Z', content: 'Hello'},
    {id: '1:event-1', label: 'Assistant', timestamp: '2026-09-15T00:00:00.000Z', content: 'Hello'},
  ])
})

test('rejects trials with unknown treatments instead of labeling them as valid results', async () => {
  await expect(
    createExperimentRunDetails('2026-09-15', createExperimentOutput([createTrial({treatmentId: 'missing'})])),
  ).rejects.toThrow('Unknown treatment')
})

test('includes the deployment base path and encodes identifiers in asset URLs', () => {
  vi.stubEnv('PAGES_BASE_PATH', '/agent-eval')
  try {
    expect(getTrialDataUrl('experiments', 'name with spaces', '2026-09-15', 'trial#1')).toBe(
      '/agent-eval/run-data/experiments/name%20with%20spaces/2026-09-15/trial%231',
    )
  } finally {
    vi.unstubAllEnvs()
  }
})

test('keeps heavy trial bodies out of the initial run summaries', async () => {
  const marker = 'UNLOADED_DETAIL_CONTENT'
  const trial = createTrial({
    checks: [
      {
        check: {name: 'tests', files: []},
        result: {type: 'outcomes', outcomes: [{type: 'outcome', status: 'passed', id: marker}]},
      },
    ],
    judges: [{...judges[0], result: {type: 'result', score: 0, rationale: marker, findings: []}}],
    walkthrough: {type: 'Screenshot', filepath: `artifacts/${marker}.png`},
  })
  const run = await createExperimentRunDetails('2026-09-15', createExperimentOutput([trial]))
  expect(JSON.stringify(run)).not.toContain(marker)
  for (const field of ['checks', 'judges', 'transcript', 'walkthrough']) {
    expect(run.results[0]).not.toHaveProperty(field)
  }
})
