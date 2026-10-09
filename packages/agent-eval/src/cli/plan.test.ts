import {expect, test} from 'vitest'
import type {CopilotRunner} from '../copilot-runner'
import {selectPlanTrials} from './plan'

function createTrials() {
  const runners: Array<CopilotRunner> = ['copilot-cli', 'copilot-sdk', 'copilot-sdk', 'copilot-cli']
  return runners.map((runner, index) => {
    return {
      id: `trial-${index}`,
      runner,
    }
  })
}

test('selectPlanTrials preserves every runner and saved trial order by default', () => {
  const trials = createTrials()

  const selected = selectPlanTrials({
    trials,
  })

  expect(selected).toEqual(trials)
})

test('selectPlanTrials selects a runner without changing trial order', () => {
  const trials = createTrials()

  const selected = selectPlanTrials({
    trials,
    runner: 'copilot-sdk',
  })

  expect(selected).toEqual([trials[1], trials[2]])
})

test('selectPlanTrials selects a shard across all runners', () => {
  const trials = createTrials()

  const selected = selectPlanTrials({
    trials,
    shard: {
      order: 1,
      total: 2,
    },
  })

  expect(selected).toEqual([trials[0], trials[2]])
})

test('selectPlanTrials assigns shards before filtering by runner', () => {
  const trials = createTrials()

  const selected = selectPlanTrials({
    trials,
    runner: 'copilot-sdk',
    shard: {
      order: 1,
      total: 2,
    },
  })

  expect(selected).toEqual([trials[2]])
})

test('selectPlanTrials allows a shard without trials for a runner present in the full plan', () => {
  const trials = createTrials()

  const selected = selectPlanTrials({
    trials,
    runner: 'copilot-sdk',
    shard: {
      order: 1,
      total: 4,
    },
  })

  expect(selected).toEqual([])
})

test('selectPlanTrials rejects a runner absent from the full plan, even when the shard is empty', () => {
  const trials = createTrials().filter(trial => {
    return trial.runner === 'copilot-cli'
  })

  expect(() => {
    selectPlanTrials({
      trials,
      runner: 'copilot-sdk',
      shard: {
        order: 4,
        total: 4,
      },
    })
  }).toThrow(
    'No trials found for runner "copilot-sdk" in the saved plan. Add "copilot-sdk" to the configuration\'s runners and create a new plan.',
  )
})
