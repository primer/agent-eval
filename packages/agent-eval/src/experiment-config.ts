import type {Model} from './model'
import type {Sandbox} from './sandbox'

type ScenarioConfig = {
  prompt: string
}

type InlineScenarioConfig = {
  name?: string
  path: string
}

type ExperimentScenarioConfig = string | InlineScenarioConfig

type ExperimentConfig = {
  name: string
  description: string
  models: Array<Model>
  scenarios: Array<ExperimentScenarioConfig>
  setup?: Setup
  treatments: Array<TreatmentConfig>
}

type TreatmentConfig = {
  name: string
  setup?: Setup
}

type Setup = ({sandbox}: {sandbox: Sandbox}) => Promise<void>

const ControlTreatment: TreatmentConfig = {
  name: 'Control',
}

export {ControlTreatment}
export type {ExperimentConfig, ExperimentScenarioConfig, InlineScenarioConfig, ScenarioConfig, TreatmentConfig}
