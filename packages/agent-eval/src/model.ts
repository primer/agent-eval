const models = [
  'claude-haiku-4.5',
  'claude-opus-4.6',
  'claude-opus-4.7',
  'claude-sonnet-4.5',
  'claude-sonnet-4.6',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.5',
] as const

const reasoningEfforts = ['low', 'medium', 'high', 'xhigh'] as const

type Model = (typeof models)[number]
type ReasoningEffort = (typeof reasoningEfforts)[number]
type ModelConfig = {
  name: Model
  reasoningEffort: ReasoningEffort
}
type ExperimentModelConfig = Model | ModelConfig

function resolveModelConfig(config: ExperimentModelConfig): ModelConfig {
  if (typeof config === 'string') {
    return {
      name: config,
      reasoningEffort: 'high',
    }
  }

  return config
}

export {models, reasoningEfforts, resolveModelConfig}
export type {ExperimentModelConfig, Model, ModelConfig, ReasoningEffort}
