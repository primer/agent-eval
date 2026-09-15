import {expect, test} from 'vitest'
import {createBenchmarkRunDetails, createExperimentRunDetails} from './run-details'
import {checks, createBenchmarkOutput, createExperimentOutput, createTrial, judges, session} from './test-fixtures'

test.each([
  {name: 'scored, error, and unknown results', judges},
  {name: 'no judges', judges: []},
])('preserves checks and $name in experiment and benchmark details', async ({judges: judgeOutputs}) => {
  const trials = [createTrial({judges: judgeOutputs})]
  const details = await createExperimentRunDetails('2026-09-15', createExperimentOutput(trials), '/results/experiment')
  expect(details.results[0]).toMatchObject({
    treatment: 'Control',
    checkSummary: '15 ms [1 error]; 50.0% [1 skipped; 1 error]',
    checks,
    turns: 2,
    outputTokens: 100,
    transcript: [],
    walkthrough: {type: 'Unavailable'},
    judges: judgeOutputs.map(output => {
      return {judge: output.judge, result: output.result}
    }),
  })
  for (const output of details.results[0].judges) {
    expect(output).not.toHaveProperty('agent')
  }
  const benchmark = await createBenchmarkRunDetails({
    id: '2026-09-15',
    name: '2026-09-15',
    date: new Date('2026-09-15'),
    directory: '/results/benchmark',
    output: createBenchmarkOutput(trials),
  })
  expect(benchmark).toEqual(details)
  expect(benchmark.results[0]).not.toHaveProperty('context')
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
  const details = await createExperimentRunDetails('2026-09-15', output, '/results')
  expect(details.results).toHaveLength(2)
  expect(details.results[0]).toMatchObject({turns: 4, outputTokens: 200, premiumRequests: 2})
  expect(details.results[0].transcript).toEqual([
    {id: '0:event-1', label: 'Assistant', timestamp: '2026-09-15T00:00:00.000Z', content: 'Hello'},
    {id: '1:event-1', label: 'Assistant', timestamp: '2026-09-15T00:00:00.000Z', content: 'Hello'},
  ])
})

test('rejects trials with unknown treatments instead of labeling them as valid results', async () => {
  await expect(
    createExperimentRunDetails(
      '2026-09-15',
      createExperimentOutput([createTrial({treatmentId: 'missing'})]),
      '/results',
    ),
  ).rejects.toThrow('Unknown treatment')
})

test('preserves unavailable bundle reasons in benchmark details', async () => {
  expect(
    await createBenchmarkRunDetails({
      id: '2026-09-15',
      name: '2026-09-15',
      date: new Date('2026-09-15'),
      directory: '/results',
      output: null,
      unavailableReason: 'Old format',
    }),
  ).toEqual({date: '2026-09-15', results: [], unavailableReason: 'Old format'})
})
