import type {ExperimentConfig, TreatmentConfig} from './experiment-config'
import type {
  CopilotPluginConfig,
  CopilotPluginSource,
  LocalCopilotPluginSource,
  McpServerConfig,
  RemoteCopilotPluginSource,
  Sandbox,
} from './sandbox'
import type {ExperimentModelConfig, Model, ModelConfig, ModelInfo, ReasoningEffort} from './model'

function defineConfig(config: ExperimentConfig): ExperimentConfig {
  return config
}

export type {
  ExperimentConfig,
  ExperimentModelConfig,
  CopilotPluginConfig,
  CopilotPluginSource,
  LocalCopilotPluginSource,
  McpServerConfig,
  Model,
  ModelConfig,
  ModelInfo,
  ReasoningEffort,
  RemoteCopilotPluginSource,
  Sandbox,
  TreatmentConfig,
}
export {defineConfig}
