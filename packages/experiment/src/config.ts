import type {EvalId} from '@primer/agent-evals'
import type {Sandbox, SandboxMount} from '@primer/agent-sandbox'
import type {Model} from './model'

type ExperimentConfig = {
  name: string
  description: string
  models: Array<Model>
  evals: Array<EvalId>
  treatments: Array<TreatmentConfig>
}

type TreatmentConfig = {
  name: string
  mounts?: Array<SandboxMount>
  setup?: ({sandbox}: {sandbox: Sandbox}) => Promise<void>
}

export type {ExperimentConfig, TreatmentConfig}
