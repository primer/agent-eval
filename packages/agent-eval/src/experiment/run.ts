import type {CopilotRunner} from '../copilot-runner'
import type {BenchmarkTrial} from '../benchmark/plan'
import {createPlanFromManifest, runPlan, type RunPlanOptions, type RunPlanResult} from '../plan'
import type {Shard} from '../shard'
import type {Trial} from '../trial/trial'
import type {BenchmarkExperiment, ScenarioExperiment} from './experiment'
import type {ExperimentPlan} from './plan'

type ExperimentRunResult =
  | {
      type: 'scenarios'
      experiment: ScenarioExperiment
      runPlanResult: RunPlanResult<Trial>
    }
  | {
      type: 'benchmark'
      experiment: BenchmarkExperiment
      runPlanResult: RunPlanResult<BenchmarkTrial>
    }

type RunExperimentPlanOptions = Omit<RunPlanOptions<Trial>, 'plan'> & {
  plan: ExperimentPlan
  shard?: Shard
  runner?: CopilotRunner
}

async function runExperimentPlan({
  plan,
  shard,
  runner,
  ...options
}: RunExperimentPlanOptions): Promise<ExperimentRunResult> {
  function execute<T extends Trial>(trials: Array<T>): Promise<RunPlanResult<T>> {
    return runPlan({
      ...options,
      plan: createPlanFromManifest({
        trials,
        shard,
        runner,
      }),
    })
  }

  if (plan.type === 'benchmark') {
    return {
      type: 'benchmark',
      experiment: plan.experiment,
      runPlanResult: await execute(plan.plan.trials),
    }
  }

  return {
    type: 'scenarios',
    experiment: plan.experiment,
    runPlanResult: await execute(plan.plan.trials),
  }
}

export {runExperimentPlan}
export type {ExperimentRunResult}
