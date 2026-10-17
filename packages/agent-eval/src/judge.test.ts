import {expect, test} from 'vitest'
import {VirtualHost} from './host'
import {parseJudgeConfig} from './judge'

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
