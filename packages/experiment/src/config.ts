import type {ScenarioId} from '@primer/agent-scenarios'
import type {Sandbox} from '@primer/agent-sandbox'
import type {Model} from './model'

type ScenarioConfig = {
  prompt: string
}

type InlineScenarioConfig = {
  name?: string
  path: string
}

type ExperimentScenarioConfig = ScenarioId | InlineScenarioConfig

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

export type {ExperimentConfig, ExperimentScenarioConfig, InlineScenarioConfig, ScenarioConfig, TreatmentConfig}
