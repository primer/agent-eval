import {
  defineConfig as defineExperimentConfig,
  type ExperimentConfig as InternalExperimentConfig,
} from './experiment/config'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Preserve the public name during declaration emit.
interface ExperimentConfig extends InternalExperimentConfig {}

const defineConfig: (config: ExperimentConfig) => ExperimentConfig = defineExperimentConfig

export {defineConfig}
export type {ExperimentConfig}
export type {CopilotRunner} from './copilot-runner'
