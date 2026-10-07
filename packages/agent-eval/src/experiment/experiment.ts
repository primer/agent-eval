import type {ExperimentConfig} from './config'
import type {ModelVariant} from '../model'
import type {Scenario} from '../scenario/scenario'
import type {Treatment, TreatmentSetup} from '../treatment'
import type {Benchmark} from '../benchmark/benchmark'

type ScenarioExperiment = {
  type: 'scenario'
  id: string
  filepath: string
  name: ExperimentConfig['name']
  description: ExperimentConfig['description']
  models: Array<ModelVariant>
  runners?: ExperimentConfig['runners']
  scenarios: Array<Scenario>
  setup?: TreatmentSetup
  treatments: Array<Treatment>
}

type BenchmarkExperiment = {
  type: 'benchmark'
  id: string
  filepath: string
  name: ExperimentConfig['name']
  description: ExperimentConfig['description']
  models: Array<ModelVariant>
  runners?: ExperimentConfig['runners']
  benchmark: Benchmark
  setup?: TreatmentSetup
  treatments: Array<Treatment>
}

type Experiment = ScenarioExperiment | BenchmarkExperiment

export type {Experiment}
