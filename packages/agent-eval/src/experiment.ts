import type {ExperimentConfig, TreatmentConfig} from './experiment-config'
import type {McpServerConfig, Sandbox} from './sandbox'
import type {Model} from './model'

function defineConfig(config: ExperimentConfig): ExperimentConfig {
  return config
}

export type {ExperimentConfig, McpServerConfig, Model, Sandbox, TreatmentConfig}
export {defineConfig}
