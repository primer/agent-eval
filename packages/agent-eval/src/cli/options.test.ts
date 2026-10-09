import {parseArgs} from 'citty'
import {expect, test} from 'vitest'
import {createScenarioPlan} from '../scenario/plan'
import {runnerFilterOption, runnerOption} from './options'

test.each([
  {
    args: [],
    expected: 'copilot-cli',
  },
  {
    args: ['--runner', 'copilot-sdk'],
    expected: 'copilot-sdk',
  },
] as const)('passes the CLI runner to scenario trials: $expected', ({args, expected}) => {
  const options = {
    runner: runnerOption,
  }
  const parsed = parseArgs<typeof options>([...args], options)

  const plan = createScenarioPlan({
    scenario: {
      id: 'example',
      directory: '/scenarios/example',
      prompt: 'Create a page',
      tags: [],
      checks: [],
      judges: [],
      image: {
        type: 'Default',
      },
    },
    runner: parsed.runner,
  })

  expect(plan.trials[0].runner).toBe(expected)
})

test('leaves saved-plan runner filtering unset by default', () => {
  const options = {
    runner: runnerFilterOption,
  }
  const parsed = parseArgs<typeof options>([], options)

  expect(parsed.runner).toBeUndefined()
})
