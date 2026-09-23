import {expect, test, vi} from 'vitest'
import {
  createBenchmarkRunDetails,
  createExperimentRunDetails,
  createTrialDetails,
  createTrialTranscript,
  getTrialDataUrl,
} from './run-details'
import {checks, createBenchmarkOutput, createExperimentOutput, createTrial, judges, session} from './test-fixtures'

type LogMessage = (typeof session.messages)[number]

function toolStart(id: string, args: string | Record<string, unknown>): LogMessage {
  return {
    type: 'tool.execution_start',
    id: `start-${id}`,
    timestamp: '2026-09-15T00:00:00.000Z',
    parentId: '',
    data: {toolCallId: id, toolName: 'bash', arguments: args, turnId: 'turn-1', model: 'model'},
  }
}

function toolComplete(id: string, result: {content: string; detailedContent: string} | {message: string}): LogMessage {
  const data = {toolCallId: id, model: 'model', interactionId: 'interaction-1', turnId: 'turn-1', toolTelemetry: {}}
  return {
    type: 'tool.execution_complete',
    id: `complete-${id}`,
    timestamp: '2026-09-15T00:00:01.000Z',
    parentId: '',
    data:
      'message' in result
        ? {...data, success: false, error: {code: 'COMMAND_FAILED', ...result}}
        : {...data, success: true, result},
  }
}

test('createTrialTranscript matches interleaved tool results to calls and preserves arguments and errors', () => {
  const trial = createTrial({
    agent: {
      sessions: [
        {
          ...session,
          messages: [
            toolStart('a', {command: 'pwd', options: {timeout: 0}}),
            toolStart('b', 'exit 1'),
            toolComplete('b', {message: 'Command exited with code 1'}),
            toolComplete('a', {content: 'Short output', detailedContent: '/workspace\n'}),
          ],
        },
      ],
    },
  })

  const entries = createTrialTranscript(trial)

  expect(
    entries.map(entry => {
      return entry.content
    }),
  ).toEqual([
    '{\n  "command": "pwd",\n  "options": {\n    "timeout": 0\n  }\n}',
    'exit 1',
    'Failed\n\nCOMMAND_FAILED: Command exited with code 1',
    'Completed successfully\n\n/workspace\n',
  ])
  expect(
    entries.flatMap(entry => {
      return entry.toolCall ? [entry.toolCall] : []
    }),
  ).toEqual([
    {
      name: 'bash',
      arguments: '{\n  "command": "pwd",\n  "options": {\n    "timeout": 0\n  }\n}',
      status: 'Completed successfully',
      output: '/workspace\n',
    },
    {
      name: 'bash',
      arguments: 'exit 1',
      status: 'Failed',
      output: 'COMMAND_FAILED: Command exited with code 1',
    },
  ])
})

test('createTrialTranscript keeps unfinished calls and unmatched results separate across sessions', () => {
  const trial = createTrial({
    agent: {
      sessions: [
        {...session, messages: [toolStart('a', '')]},
        {...session, messages: [toolComplete('a', {content: 'Result without a start', detailedContent: ''})]},
      ],
    },
  })

  expect(createTrialTranscript(trial)).toEqual([
    {
      id: '0:start-a',
      label: 'Tool call: bash',
      timestamp: '2026-09-15T00:00:00.000Z',
      content: '',
      toolCall: {name: 'bash', arguments: '', status: 'Started'},
    },
    {
      id: '1:complete-a',
      label: 'Tool result: Unknown tool',
      timestamp: '2026-09-15T00:00:01.000Z',
      content: 'Completed successfully\n\nResult without a start',
      toolCall: {name: 'Unknown tool', status: 'Completed successfully', output: 'Result without a start'},
    },
  ])
})

test('createTrialTranscript preserves empty results and keeps tool content out of run summaries', async () => {
  const marker = 'TOOL_ARGUMENT_CONTENT'
  const trial = createTrial({
    agent: {
      sessions: [
        {
          ...session,
          tools: {bash: 1},
          messages: [toolStart('a', marker), toolComplete('a', {content: '', detailedContent: ''})],
        },
      ],
    },
  })

  const run = await createExperimentRunDetails('2026-09-15', createExperimentOutput([trial]))
  const entries = createTrialTranscript(trial)

  expect(JSON.stringify(run)).not.toContain(marker)
  expect(run.results[0].counts.transcript).toBe(2)
  expect(entries[0].toolCall).toEqual({
    name: 'bash',
    arguments: marker,
    status: 'Completed successfully',
    output: '',
  })
  expect(entries[1].content).toBe('Completed successfully')
})

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
    runner: 'copilot-cli',
    treatment: 'Control',
    checkSummary: '15 ms [1 error]; 50.0% [1 skipped; 1 error]',
    turns: 2,
    outputTokens: 100,
    premiumRequests: 1,
    totalApiDurationMs: 200,
    sessionDurationMs: 300,
    tools: [],
    counts: {checks: checks.length, transcript: 0, judges: judgeOutputs.length},
    walkthroughPreview: {type: 'Unavailable', count: 0},
    detailsUrl: `${baseUrl}/details.json`,
    transcriptUrl: `${baseUrl}/transcript.json`,
    workspace: {type: 'unavailable', reason: 'The generated workspace is missing from this result bundle.'},
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

test.each(['copilot-cli', 'copilot-sdk'] as const)(
  'aggregates recorded tool counts for each %s trial without including judges',
  async runner => {
    const trial = createTrial({
      runner,
      agent: {
        sessions: [
          {...session, tools: {view: 2, bash: 1, 'github/search': 1}},
          {...session, tools: {bash: 3, edit: 1}},
        ],
      },
      judges: [{...judges[0], agent: {session: {...session, tools: {judgeOnly: 100, bash: 100}}}}],
    })
    const output = createExperimentOutput([trial, createTrial({id: 'trial-2'})])
    const details = await createExperimentRunDetails('2026-09-15', output)
    const expected = [
      {name: 'bash', count: 4},
      {name: 'view', count: 2},
      {name: 'edit', count: 1},
      {name: 'github/search', count: 1},
    ]
    expect(details.results[0].tools).toEqual(expected)
    expect(details.results[1].tools).toEqual([])
    const benchmark = await createBenchmarkRunDetails({
      id: '2026-09-15',
      name: '2026-09-15',
      date: new Date('2026-09-15'),
      directory: '/results/benchmark',
      output: createBenchmarkOutput([trial]),
    })
    expect(benchmark.results[0].tools).toEqual(expected)
  },
)

test.each([undefined, 'copilot-cli', 'copilot-sdk'] as const)(
  'preserves runner metadata with a legacy CLI default: %s',
  async runner => {
    const output = createExperimentOutput([createTrial({runner})])
    const details = await createExperimentRunDetails('2026-09-15', output)
    expect(details.results[0].runner).toBe(runner ?? 'copilot-cli')
    const benchmark = await createBenchmarkRunDetails({
      id: '2026-09-15',
      name: '2026-09-15',
      date: new Date('2026-09-15'),
      directory: '/results/benchmark',
      output: createBenchmarkOutput([createTrial({runner})]),
    })
    expect(benchmark.results[0].runner).toBe(runner ?? 'copilot-cli')
  },
)

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
  expect(run.results[0].walkthroughPreview).toEqual({type: 'Screenshot', count: 1})
  for (const field of ['checks', 'judges', 'transcript', 'walkthrough']) {
    expect(run.results[0]).not.toHaveProperty(field)
  }
})

test('provides only the gallery shape needed to reserve the initial loading layout', async () => {
  const run = await createExperimentRunDetails(
    '2026-09-15',
    createExperimentOutput([createTrial({walkthrough: {type: 'Screenshots', screenshots: ['one.png', 'two.png']}})]),
  )
  expect(run.results[0].walkthroughPreview).toEqual({type: 'Screenshots', count: 2})
  expect(JSON.stringify(run)).not.toContain('one.png')
})
