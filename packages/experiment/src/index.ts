import type {
  ExperimentConfig,
  ExperimentScenarioConfig,
  InlineScenarioConfig,
  ScenarioConfig,
  TreatmentConfig,
} from './config'

const ControlTreatment: TreatmentConfig = {
  name: 'Control',
}

export {ControlTreatment}
export type {ExperimentConfig, ExperimentScenarioConfig, InlineScenarioConfig, ScenarioConfig, TreatmentConfig}
export type {Model} from './model'
