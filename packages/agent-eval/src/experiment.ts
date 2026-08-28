import type {ExperimentConfig, TreatmentConfig} from './experiment-config'
import type {
  CopilotPluginConfig,
  CopilotPluginSource,
  LocalCopilotPluginSource,
  McpServerConfig,
  RemoteCopilotPluginSource,
  SandboxInstance,
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
  SandboxInstance as Sandbox,
  TreatmentConfig,
}
export {defineConfig}
