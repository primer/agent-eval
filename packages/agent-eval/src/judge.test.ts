import {expect, test} from 'vitest'
import * as z from 'zod/mini'
import {
  getJudgeModel,
  getJudgePrompt,
  JudgeConfigSchema,
  JudgeOutputSchema,
  JudgeResultSchema,
  type JudgeConfig,
  type JudgeResult,
} from './judge'
import type {Trial} from './trial'

const config: JudgeConfig = {
  name: 'correctness',
  judge: {},
  scores: [
    {value: 0, description: 'Does not meet the requirements.'},
    {value: 1, description: 'Meets the requirements.'},
  ],
}

const result: JudgeResult = {
  score: 1,
  rationale: 'The implementation meets the requirements.',
  findings: [
    {
      filepath: 'src/index.ts',
      snippet: 'return true',
      explanation: 'The function returns the required value.',
    },
  ],
}

function createTrial(model: Trial['model']): Trial {
  return {
    id: 'test-trial',
    scenario: {
      id: 'test-scenario',
      directory: '/scenarios/test',
      prompt: 'Implement the requested behavior.',
      tags: [],
      testPath: '/scenarios/test/scenario.test.ts',
    },
    treatment: {name: 'control'},
    model,
  }
}

test('JudgeConfigSchema accepts required fields without optional judge settings', () => {
  expect(JudgeConfigSchema.parse(config)).toEqual(config)
})

test('JudgeConfigSchema accepts description, instructions, and an explicit model variant', () => {
  const completeConfig: JudgeConfig = {
    ...config,
    description: 'Evaluate correctness.',
    judge: {
      model: {name: 'claude-opus-5', reasoningEffort: 'high'},
      instructions: 'Inspect the implementation.',
    },
  }

  expect(JudgeConfigSchema.parse(completeConfig)).toEqual(completeConfig)
})

test.each([
  ['missing name', {judge: {}, scores: config.scores}],
  ['missing judge', {name: config.name, scores: config.scores}],
  ['missing scores', {name: config.name, judge: {}}],
  ['invalid instructions', {...config, judge: {instructions: 42}}],
  ['nonnumeric score value', {...config, scores: [{value: '1', description: 'Meets requirements.'}]}],
  ['missing score description', {...config, scores: [{value: 1}]}],
  ['unknown model', {...config, judge: {model: {name: 'unknown', reasoningEffort: 'medium'}}}],
  ['missing reasoning effort', {...config, judge: {model: {name: 'gpt-5.6-sol'}}}],
  ['unsupported reasoning effort', {...config, judge: {model: {name: 'gpt-5.4', reasoningEffort: 'max'}}}],
  ['model configuration instead of variant', {...config, judge: {model: 'gpt-5.6-sol'}}],
])('JudgeConfigSchema rejects %s', (_name, input) => {
  expect(JudgeConfigSchema.safeParse(input).success).toBe(false)
})

test('JudgeResultSchema accepts a score, rationale, and file-backed findings', () => {
  expect(JudgeResultSchema.parse(result)).toEqual(result)
})

test('JudgeResultSchema accepts an empty findings array', () => {
  const emptyFindings: JudgeResult = {
    score: 0,
    rationale: 'No implementation files were available for inspection.',
    findings: [],
  }

  expect(JudgeResultSchema.parse(emptyFindings)).toEqual(emptyFindings)
})

test.each([
  ['missing score', {rationale: result.rationale, findings: []}],
  ['nonnumeric score', {...result, score: '1'}],
  ['nonfinite score', {...result, score: Infinity}],
  ['missing rationale', {score: 1, findings: []}],
  ['legacy rational key', {score: 1, rational: result.rationale, findings: []}],
  ['nonstring rationale', {...result, rationale: 42}],
  ['missing findings', {score: 1, rationale: result.rationale}],
  ['nonarray findings', {...result, findings: {}}],
  ['missing finding filepath', {...result, findings: [{snippet: 'return true', explanation: 'Meets requirements.'}]}],
  ['missing finding snippet', {...result, findings: [{filepath: 'src/index.ts', explanation: 'Meets requirements.'}]}],
  ['missing finding explanation', {...result, findings: [{filepath: 'src/index.ts', snippet: 'return true'}]}],
  [
    'nonstring finding field',
    {...result, findings: [{filepath: 42, snippet: 'return true', explanation: 'Evidence.'}]},
  ],
])('JudgeResultSchema rejects %s', (_name, input) => {
  expect(JudgeResultSchema.safeParse(input).success).toBe(false)
})

test('JudgeOutputSchema accepts the configuration and result together', () => {
  expect(JudgeOutputSchema.parse({config, result})).toEqual({config, result})
})

test.each([
  ['missing configuration', {result}],
  ['missing result', {config}],
  ['invalid configuration', {config: {...config, scores: 'invalid'}, result}],
  ['invalid result', {config, result: {...result, score: 'invalid'}}],
])('JudgeOutputSchema rejects %s', (_name, input) => {
  expect(JudgeOutputSchema.safeParse(input).success).toBe(false)
})

test('getJudgeModel selects Claude for a GPT trial', () => {
  const trial = createTrial({name: 'gpt-5.6-sol', reasoningEffort: 'max'})

  expect(getJudgeModel(config, trial)).toEqual({name: 'claude-opus-5', reasoningEffort: 'medium'})
})

test.each(['claude-opus-5', 'gemini-3.5-flash'] as const)('getJudgeModel selects GPT for a %s trial', name => {
  const trial = createTrial({name, reasoningEffort: 'high'})

  expect(getJudgeModel(config, trial)).toEqual({name: 'gpt-5.6-sol', reasoningEffort: 'medium'})
})

test.each(['gpt-5.6-sol', 'claude-opus-5', 'gemini-3.5-flash'] as const)(
  'getJudgeModel honors an explicit model and reasoning effort for a %s trial',
  name => {
    const explicitConfig: JudgeConfig = {
      ...config,
      judge: {model: {name: 'gpt-5.4-mini', reasoningEffort: 'low'}},
    }
    const trial = createTrial({name, reasoningEffort: 'medium'})

    expect(getJudgeModel(explicitConfig, trial)).toEqual({name: 'gpt-5.4-mini', reasoningEffort: 'low'})
  },
)

test('getJudgePrompt includes the judge criteria, instructions, and exact report filename', () => {
  const promptConfig: JudgeConfig = {
    name: 'accessibility',
    description: 'Evaluate keyboard accessibility.',
    judge: {
      model: {name: 'gpt-5.6-sol', reasoningEffort: 'medium'},
      instructions: 'Inspect focus order.\nDo not grade visual styling.',
    },
    scores: [
      {value: 10, description: 'Keyboard navigation is blocked.'},
      {value: -1, description: 'All controls are keyboard accessible.'},
    ],
  }

  const prompt = getJudgePrompt(promptConfig)
  const configuration = prompt.split('## Judge configuration\n\n')[1]!.split('\n\n## Report file')[0]!
  const reportFile = prompt.split('## Report file\n\n')[1]!.split('\n\n## Result JSON Schema')[0]!

  expect(JSON.parse(configuration)).toEqual({
    name: promptConfig.name,
    description: promptConfig.description,
    instructions: promptConfig.judge.instructions,
    scores: promptConfig.scores,
  })
  expect(JSON.parse(reportFile)).toBe('judge-accessibility-report.json')
  expect(prompt).not.toContain('gpt-5.6-sol')
})

test('getJudgePrompt supports omitted description and instructions and embeds the result schema', () => {
  const prompt = getJudgePrompt({
    name: 'correctness',
    judge: {},
    scores: [{value: 0, description: 'Does not meet the requirements.'}],
  })
  const configuration = prompt.split('## Judge configuration\n\n')[1]!.split('\n\n## Report file')[0]!
  const schema = prompt.split('## Result JSON Schema\n\n')[1]!

  expect(JSON.parse(configuration)).toEqual({
    name: 'correctness',
    scores: [{value: 0, description: 'Does not meet the requirements.'}],
  })
  expect(JSON.parse(schema)).toEqual(z.toJSONSchema(JudgeResultSchema))
  expect(JSON.parse(schema).required).toEqual(['score', 'rationale', 'findings'])
  expect(prompt).not.toContain('undefined')
})
