import {expect, expectTypeOf, test} from 'vitest'
import {VirtualHost} from './host'
import {getJudgePrompt, JudgeOutputSchema, parseJudgeConfig, parseJudgeReport, type JudgeConfig} from './judge'

test('parseJudgeConfig preserves rubric metadata and defaults omitted reference files', async () => {
  const host = VirtualHost.create()
  const input = {
    name: 'visual',
    description: 'Visual fidelity',
    instructions: 'Compare the reference',
    scores: [
      {value: 0, description: 'Does not match'},
      {value: 1, description: 'Matches'},
    ],
  }

  const judge = await parseJudgeConfig(host, '/scenario', input)

  expect(judge).toEqual({
    name: 'visual',
    description: 'Visual fidelity',
    instructions: 'Compare the reference',
    files: [],
    scores: [
      {value: 0, description: 'Does not match'},
      {value: 1, description: 'Matches'},
    ],
  })
})

test('JudgeConfig requires all numeric or all string score values', () => {
  expectTypeOf<JudgeConfig['scores']>().toEqualTypeOf<
    Array<{value: number; description: string}> | Array<{value: string; description: string}>
  >()
})

test('parseJudgeConfig accepts string score values', async () => {
  const host = VirtualHost.create()
  const scores = [
    {value: 'fail', description: 'Does not match'},
    {value: 'pass', description: 'Matches'},
  ]

  const judge = await parseJudgeConfig(host, '/scenario', {name: 'visual', scores})

  expect(judge.scores).toEqual(scores)
})

test.each([
  {name: 'empty', scores: []},
  {
    name: 'mixed numeric and string',
    scores: [
      {value: 0, description: 'Does not match'},
      {value: 'pass', description: 'Matches'},
    ],
  },
  {name: 'boolean', scores: [{value: true, description: 'Matches'}]},
])('parseJudgeConfig rejects $name scores', async ({scores}) => {
  const host = VirtualHost.create()

  await expect(parseJudgeConfig(host, '/scenario', {name: 'visual', scores})).rejects.toThrow('Invalid judge config')
})

test.each([
  {name: 'numeric', value: 0},
  {name: 'string', value: 'pass'},
])('parseJudgeReport accepts a configured $name score', async ({value}) => {
  const judge = await parseJudgeConfig(VirtualHost.create(), '/scenario', {
    name: 'visual',
    scores: [{value, description: 'Matches'}],
  })
  const report = {score: value, rationale: 'Matches the reference', findings: []}

  const result = parseJudgeReport(judge, JSON.stringify(report))

  expect(result).toEqual({type: 'result', ...report})
})

test.each([
  {name: 'unconfigured string', value: 'other'},
  {name: 'numeric value with a matching string representation', value: 1},
])('parseJudgeReport rejects an $name score', async ({value}) => {
  const judge = await parseJudgeConfig(VirtualHost.create(), '/scenario', {
    name: 'visual',
    scores: [{value: '1', description: 'Matches'}],
  })
  const report = {score: value, rationale: 'Matches the reference', findings: []}

  const result = parseJudgeReport(judge, JSON.stringify(report))

  expect(result).toEqual({
    type: 'error',
    message: `Judge "visual" returned an unconfigured score: ${value}`,
  })
})

test('JudgeOutputSchema preserves string scores in saved output', async () => {
  const judge = await parseJudgeConfig(VirtualHost.create(), '/scenario', {
    name: 'visual',
    scores: [{value: 'pass', description: 'Matches'}],
  })
  const output = {
    judge,
    result: {type: 'result', score: 'pass', rationale: 'Matches', findings: []},
    agent: {
      session: {
        turns: 0,
        outputTokens: 0,
        premiumRequests: 0,
        totalApiDurationMs: 0,
        sessionDurationMs: 0,
        tools: {},
        messages: [],
      },
    },
  }

  const parsed = JudgeOutputSchema.parse(JSON.parse(JSON.stringify(output)))

  expect(parsed).toEqual(output)
})

test('getJudgePrompt allows string scores and requires preserving their JSON type', async () => {
  const judge = await parseJudgeConfig(VirtualHost.create(), '/scenario', {
    name: 'visual',
    scores: [{value: 'pass', description: 'Matches'}],
  })

  const prompt = getJudgePrompt(judge)
  const schema = JSON.parse(prompt.split('## Result JSON Schema\n')[1]!)

  expect(prompt).toContain('preserving its JSON type (number or string)')
  expect(prompt).toContain('"value": "pass"')
  expect(schema.properties.score).toEqual({type: ['number', 'string']})
})
