const models = [
  {
    name: 'claude-haiku-4.5',
    supportedReasoningEfforts: [],
  },
  {
    name: 'claude-opus-4.6',
    supportedReasoningEfforts: ['low', 'medium', 'high', 'max'],
  },
  {
    name: 'claude-opus-4.7',
    supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    name: 'claude-sonnet-4.5',
    supportedReasoningEfforts: [],
  },
  {
    name: 'claude-sonnet-4.6',
    supportedReasoningEfforts: ['low', 'medium', 'high', 'max'],
  },
  {
    name: 'gpt-5.4',
    supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
  },
  {
    name: 'gpt-5.4-mini',
    supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
  },
  {
    name: 'gpt-5.5',
    supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
  },
] as const

type ModelInfo = (typeof models)[number]
type Model = ModelInfo['name']
type ReasoningEffort = ModelInfo['supportedReasoningEfforts'][number]
type ModelConfig = {
  [Info in ModelInfo as Info['name']]: {
    name: Info['name']
    reasoningEffort: Info['supportedReasoningEfforts'][number]
  }
}[Model]
type ExperimentModelConfig = Model | ModelConfig

function resolveModelConfig(config: ExperimentModelConfig): {name: Model; reasoningEffort?: ReasoningEffort} {
  if (typeof config === 'string') {
    const model = models.find(({name}) => name === config)

    return {
      name: config,
      reasoningEffort: model?.supportedReasoningEfforts.length === 0 ? undefined : 'high',
    }
  }

  return config
}

export {models, resolveModelConfig}
export type {ExperimentModelConfig, Model, ModelConfig, ModelInfo, ReasoningEffort}
