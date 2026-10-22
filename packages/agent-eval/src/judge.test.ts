import {expect, test} from 'vitest'
import {VirtualHost} from './host'
import {getJudgePrompt, parseJudgeConfig} from './judge'

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

test('getJudgePrompt identifies implementation sessions without changing the report contract', async () => {
  const judge = await parseJudgeConfig(VirtualHost.create(), '/scenario', {
    name: 'Instruction compliance',
    instructions: 'Inspect the implementation session for evidence of verification.',
    scores: [
      {value: 0, description: 'Verification was omitted'},
      {value: 1, description: 'Verification was performed'},
    ],
  })

  const prompt = getJudgePrompt(judge, ['implementation-session'])

  expect(prompt).toContain('/home/node/.copilot')
  expect(prompt).toContain('["implementation-session"]')
  expect(prompt).toContain('do not resume sessions')
  expect(prompt).toContain('Session paths are outside the workspace')
  expect(prompt).toContain('Use exactly the fields score, rationale, and findings')
  expect(getJudgePrompt(judge)).not.toContain('## Implementation sessions')
})
