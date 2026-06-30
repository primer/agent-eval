import type {
  ExperimentConfig as ProjectExperimentConfig,
  Model as ProjectModel,
  TreatmentConfig as ProjectTreatmentConfig,
} from '@primer/agent-experiment'
import type {McpServerConfig as ProjectMcpServerConfig, Sandbox as ProjectSandbox} from '@primer/agent-sandbox'

type EvalConfig = {
  prompt: string
}

type ExperimentConfig = ProjectExperimentConfig
type McpServerConfig = ProjectMcpServerConfig
type Model = ProjectModel
type Sandbox = ProjectSandbox
type TreatmentConfig = ProjectTreatmentConfig

function defineConfig(config: EvalConfig) {
  return config
}

function createExperiment(config: ExperimentConfig) {
  return config
}

export type {EvalConfig, ExperimentConfig, McpServerConfig, Model, Sandbox, TreatmentConfig}
export {createExperiment, defineConfig}
