import type {CopilotRunner} from '../copilot-runner'
import {selectShard, type Shard} from '../shard'
import type {Trial} from '../trial/trial'

type SelectPlanTrialsOptions<T> = {
  trials: Array<T>
  runner?: CopilotRunner
  shard?: Shard
}

function selectPlanTrials<T extends Pick<Trial, 'runner'>>({
  trials,
  runner,
  shard,
}: SelectPlanTrialsOptions<T>): Array<T> {
  if (
    runner &&
    !trials.some(trial => {
      return trial.runner === runner
    })
  ) {
    throw new Error(
      `No trials found for runner "${runner}" in the saved plan. Add "${runner}" to the configuration's runners and create a new plan.`,
    )
  }

  const selected = shard ? selectShard(trials, shard) : trials
  return runner
    ? selected.filter(trial => {
        return trial.runner === runner
      })
    : selected
}

export {selectPlanTrials}
