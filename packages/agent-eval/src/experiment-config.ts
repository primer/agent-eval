import type {ExperimentModelConfig} from './model'
import type {Sandbox} from './sandbox'

type ScenarioConfig = {
  description?: string
  prompt: string
  tags?: Array<string>
}

type InlineScenarioConfig = {
  name?: string
  path: string
}

type ExperimentScenarioConfig = string | InlineScenarioConfig

type ExperimentConfig = {
  name: string
  description: string
  models: Array<ExperimentModelConfig>
  runners?: Array<CopilotRunner>
  scenarios: Array<ExperimentScenarioConfig>
  setup?: Setup
  treatments: Array<TreatmentConfig>
}

type CopilotRunner = 'copilot-cli' | 'copilot-sdk'

type TreatmentConfig = {
  name: string
  setup?: Setup
}

type Setup = ({sandbox}: {sandbox: Sandbox}) => Promise<void>

const ControlTreatment: TreatmentConfig = {
  name: 'Control',
}

export {ControlTreatment}
export type {CopilotRunner, ExperimentConfig, ExperimentScenarioConfig, InlineScenarioConfig, ScenarioConfig, TreatmentConfig}
