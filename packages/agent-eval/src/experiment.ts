import type {ExperimentConfig, TreatmentConfig} from './experiment-config'
import type {McpServerConfig, Sandbox} from './sandbox'
import type {ExperimentModelConfig, Model, ModelConfig, ModelInfo, ReasoningEffort} from './model'

function defineConfig(config: ExperimentConfig): ExperimentConfig {
  return config
}

export type {
  ExperimentConfig,
  ExperimentModelConfig,
  McpServerConfig,
  Model,
  ModelConfig,
  ModelInfo,
  ReasoningEffort,
  Sandbox,
  TreatmentConfig,
}
export {defineConfig}
