import type {ExperimentConfig} from './config'
import type {ModelVariant} from '../model'
import type {Scenario} from '../scenario/scenario'
import type {Treatment, TreatmentSetup} from '../treatment'
import type {Benchmark} from '../benchmark/benchmark'

type ExperimentBase = {
  id: string
  filepath: string
  name: ExperimentConfig['name']
  description: ExperimentConfig['description']
  models: Array<ModelVariant>
  runners?: ExperimentConfig['runners']
  setup?: TreatmentSetup
  treatments: Array<Treatment>
}

type ScenarioExperiment = ExperimentBase & {
  type: 'scenarios'
  scenarios: Array<Scenario>
}

type BenchmarkExperiment = ExperimentBase & {
  type: 'benchmark'
  benchmark: Benchmark
}

type Experiment = ScenarioExperiment | BenchmarkExperiment

function getExperimentScenarios(experiment: Experiment): Array<Scenario> {
  if (experiment.type === 'scenarios') {
    return experiment.scenarios
  }

  return [
    ...new Map(
      experiment.benchmark.capabilities.flatMap(capability => {
        return capability.scenarios.map(scenario => {
          return [scenario.id, scenario] as const
        })
      }),
    ).values(),
  ]
}

export {getExperimentScenarios}
export type {Experiment, ScenarioExperiment, BenchmarkExperiment}
