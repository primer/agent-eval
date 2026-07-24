import type {ExperimentConfig, TreatmentConfig} from './experiment-config'
import type {McpServerConfig, Sandbox} from './sandbox'
import type {ExperimentModelConfig, Model, ModelConfig, ReasoningEffort} from './model'

function defineConfig(config: ExperimentConfig): ExperimentConfig {
  return config
}

export type {
  ExperimentConfig,
  ExperimentModelConfig,
  McpServerConfig,
  Model,
  ModelConfig,
  ReasoningEffort,
  Sandbox,
  TreatmentConfig,
}
export {defineConfig}
