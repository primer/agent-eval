import type {ExperimentConfig} from './config'
import type {ModelVariant} from '../model'
import type {Scenario} from '../scenario/scenario'
import type {Treatment, TreatmentSetup} from '../treatment'
import type {Benchmark} from '../benchmark/benchmark'
import {hash} from '../hash'

type BenchmarkExperiment = {
  type: 'benchmark'
  id: string
  filepath: string
  name: ExperimentConfig['name']
  description: ExperimentConfig['description']
  models: Array<ModelVariant>
  runners: ExperimentConfig['runners']
  benchmark: Benchmark
  setup?: TreatmentSetup
  treatments: Array<Treatment>
}

type ScenarioExperiment = {
  type: 'scenario'
  id: string
  filepath: string
  name: ExperimentConfig['name']
  description: ExperimentConfig['description']
  models: Array<ModelVariant>
  runners: ExperimentConfig['runners']
  scenarios: Array<Scenario>
  setup?: TreatmentSetup
  treatments: Array<Treatment>
}

type Experiment = ScenarioExperiment | BenchmarkExperiment

function getExperimentId(filenameStem: string): string {
  return hash(`Experiment:${filenameStem}`)
}

export {getExperimentId}
export type {Experiment, ScenarioExperiment, BenchmarkExperiment}
