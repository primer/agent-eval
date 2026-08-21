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

type CapabilityConfig = {
  name: string
  description: string
  scenarios: Array<ExperimentScenarioConfig>
}

type BenchmarkConfig = {
  name: string
  description: string
  models: Array<ExperimentModelConfig>
  capabilities: Array<CapabilityConfig>
  setup?: Setup
  treatments: Array<TreatmentConfig>
}

type ExperimentConfig = {
  name: string
  description: string
  models: Array<ExperimentModelConfig>
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
export type {
  BenchmarkConfig,
  CapabilityConfig,
  ExperimentConfig,
  ExperimentScenarioConfig,
  InlineScenarioConfig,
  ScenarioConfig,
  TreatmentConfig,
}
