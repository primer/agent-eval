import type {EvalId} from '@primer/agent-evals'
import type {Sandbox} from '@primer/agent-sandbox'
import type {Model} from './model'

type EvalConfig = {
  prompt: string
}

type InlineEvalConfig = {
  name: string
  path: string
  config?: EvalConfig
  configPath?: string
  testPath?: string
}

type ExperimentEvalConfig = EvalId | InlineEvalConfig

type ExperimentConfig = {
  name: string
  description: string
  models: Array<Model>
  evals: Array<ExperimentEvalConfig>
  treatments: Array<TreatmentConfig>
}

type TreatmentConfig = {
  name: string
  setup?: ({sandbox}: {sandbox: Sandbox}) => Promise<void>
}

export type {EvalConfig, ExperimentConfig, ExperimentEvalConfig, InlineEvalConfig, TreatmentConfig}
