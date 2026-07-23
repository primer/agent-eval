import type {
  ExperimentConfig as ProjectExperimentConfig,
  Model as ProjectModel,
  TreatmentConfig as ProjectTreatmentConfig,
} from '@primer/agent-experiment'
import type {McpServerConfig as ProjectMcpServerConfig, Sandbox as ProjectSandbox} from '@primer/agent-sandbox'

type ExperimentConfig = ProjectExperimentConfig
type McpServerConfig = ProjectMcpServerConfig
type Model = ProjectModel
type Sandbox = ProjectSandbox
type TreatmentConfig = ProjectTreatmentConfig

function createExperiment(config: ExperimentConfig) {
  return config
}

export type {ExperimentConfig, McpServerConfig, Model, Sandbox, TreatmentConfig}
export {createExperiment}
