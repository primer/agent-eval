import {expect, test} from 'vitest'
import {
  accessibilityJudge,
  codeMaintainabilityJudge,
  interactionClarityJudge,
  testQualityJudge,
  visualFidelityJudge,
} from './index'
import {VirtualHost} from './host'
import {getJudgePrompt, parseJudgeConfig, parseJudgeReport} from './judge'
import {defineConfig} from './scenario'

test.each([
  visualFidelityJudge,
  interactionClarityJudge,
  accessibilityJudge,
  codeMaintainabilityJudge,
  testQualityJudge,
])('$name preset can be used directly in scenario judges', async preset => {
  const config = defineConfig({prompt: 'Implement search', judges: [preset]})
  const judge = await parseJudgeConfig(VirtualHost.create(), '/scenario', config.judges[0])

  expect(judge).toEqual(preset)
  expect(judge.model).toBeUndefined()
  expect(judge.files).toEqual([])
  expect(judge.scores.map(score => score.value)).toEqual([0, 1, 2])
  expect(getJudgePrompt(judge)).toContain(JSON.stringify(preset.instructions))
  for (const {value} of judge.scores) {
    expect(
      parseJudgeReport(judge, JSON.stringify({score: value, rationale: 'Inspected evidence', findings: []})),
    ).toEqual({type: 'result', score: value, rationale: 'Inspected evidence', findings: []})
  }
})

test('judge presets support scenario-specific overrides without changing the defaults', async () => {
  const host = VirtualHost.create()
  await host.fs.mkdir('/scenario/references', {recursive: true})
  await host.fs.writeFile('/scenario/references/design.txt', 'Search field above the project list')
  const config = defineConfig({
    prompt: 'Implement search',
    judges: [
      {
        ...visualFidelityJudge,
        name: 'Search layout',
        files: ['references/design.txt'],
        model: {name: 'gpt-5.4', reasoningEffort: 'low'},
        instructions: `${visualFidelityJudge.instructions}\nEvaluate only the project search page.`,
        scores: [
          {value: 0, description: 'Does not match'},
          {value: 1, description: 'Matches'},
        ],
      },
      visualFidelityJudge,
    ],
  })
  const judge = await parseJudgeConfig(host, '/scenario', config.judges[0])

  expect(judge).toMatchObject({
    name: 'Search layout',
    files: [{filepath: '/scenario/references/design.txt', relativePath: 'references/design.txt'}],
    model: {name: 'gpt-5.4', reasoningEffort: 'low'},
    instructions: `${visualFidelityJudge.instructions}\nEvaluate only the project search page.`,
    scores: [
      {value: 0, description: 'Does not match'},
      {value: 1, description: 'Matches'},
    ],
  })
  expect(config.judges[1]).toEqual(visualFidelityJudge)
  expect(visualFidelityJudge.name).toBe('Visual fidelity')
  expect(visualFidelityJudge.files).toEqual([])
  expect(visualFidelityJudge.model).toBeUndefined()
  expect(visualFidelityJudge.scores.map(score => score.value)).toEqual([0, 1, 2])
})
