const models = [
  {
    name: 'claude-haiku-4.5',
    reasoningEfforts: [],
  },
  {
    name: 'claude-opus-4.6',
    reasoningEfforts: ['low', 'medium', 'high', 'max'],
  },
  {
    name: 'claude-opus-4.7',
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    name: 'claude-sonnet-4.5',
    reasoningEfforts: [],
  },
  {
    name: 'claude-sonnet-4.6',
    reasoningEfforts: ['low', 'medium', 'high', 'max'],
  },
  {
    name: 'gpt-5.4',
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
  },
  {
    name: 'gpt-5.4-mini',
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
  },
  {
    name: 'gpt-5.5',
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
  },
] as const

type ModelInfo = (typeof models)[number]
type Model = ModelInfo['name']
type ReasoningEffort = ModelInfo['reasoningEfforts'][number]
type ModelConfig = {
  [Info in ModelInfo as Info['name']]: {
    name: Info['name']
    reasoningEfforts: Array<Info['reasoningEfforts'][number]>
  }
}[Model]
type ExperimentModelConfig = ModelConfig

function resolveModelConfigs(config: ExperimentModelConfig): Array<{name: Model; reasoningEffort?: ReasoningEffort}> {
  if (config.reasoningEfforts.length === 0) {
    return [{name: config.name}]
  }

  return config.reasoningEfforts.map(reasoningEffort => ({
    name: config.name,
    reasoningEffort,
  }))
}

export {models, resolveModelConfigs}
export type {ExperimentModelConfig, Model, ModelConfig, ModelInfo, ReasoningEffort}
