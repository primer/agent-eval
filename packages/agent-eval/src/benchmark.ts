import type {BenchmarkConfig, CapabilityConfig, TreatmentConfig} from './experiment-config'
import type {ExperimentModelConfig, Model, ModelConfig, ModelInfo, ReasoningEffort} from './model'
import type {
  CopilotPluginConfig,
  CopilotPluginSource,
  LocalCopilotPluginSource,
  McpServerConfig,
  RemoteCopilotPluginSource,
  Sandbox,
} from './sandbox'

function defineBenchmark(config: BenchmarkConfig): BenchmarkConfig {
  return config
}

export type {
  BenchmarkConfig,
  CapabilityConfig,
  CopilotPluginConfig,
  CopilotPluginSource,
  ExperimentModelConfig,
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
export {defineBenchmark}
