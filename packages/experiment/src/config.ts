import type {EvalId} from '@primer/agent-evals'
import type {Sandbox} from '@primer/agent-sandbox'
import type {Model} from './model'

type ExperimentConfig = {
  name: string
  description: string
  models: Array<Model>
  evals: Array<EvalId>
  setup?: Setup
  treatments: Array<TreatmentConfig>
}

type TreatmentConfig = {
  name: string
  setup?: Setup
}

type Setup = ({sandbox}: {sandbox: Sandbox}) => Promise<void>

export type {ExperimentConfig, TreatmentConfig}
