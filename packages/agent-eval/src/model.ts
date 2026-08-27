import * as z from 'zod/mini'

const models = [
  {
    name: 'claude-opus-4.6',
    reasoningEfforts: ['low', 'medium', 'high', 'max'],
  },
  {
    name: 'claude-opus-4.7',
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    name: 'claude-opus-4.8',
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    name: 'claude-opus-5',
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    name: 'claude-sonnet-4.6',
    reasoningEfforts: ['low', 'medium', 'high', 'max'],
  },
  {
    name: 'claude-sonnet-5',
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    name: 'gemini-3.1-pro-preview',
    reasoningEfforts: ['low', 'medium', 'high'],
  },
  {
    name: 'gemini-3.5-flash',
    reasoningEfforts: ['minimal', 'low', 'medium', 'high'],
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
  {
    name: 'gpt-5.6-luna',
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    name: 'gpt-5.6-sol',
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    name: 'gpt-5.6-terra',
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
] as const

type ModelConfig = (typeof models)[number]
type Model = ModelConfig['name']
type ReasoningEfforts<M extends Model> = Extract<ModelConfig, {name: M}>['reasoningEfforts']
type ReasoningEffort<M extends Model> = ReasoningEfforts<M>[number]
type ModelVariant<M extends Model> = {
  name: M
  reasoningEffort: ReasoningEffort<M>
}

const ModelVariantConfigSchema = z.array(
  z.union([
    z.enum(models.map(model => model.name)),
    z.object({
      name: z.literal(models[0].name),
      reasoningEfforts: z.optional(z.array(z.enum(models[0].reasoningEfforts))),
    }),
    z.object({
      name: z.literal(models[1].name),
      reasoningEfforts: z.optional(z.array(z.enum(models[1].reasoningEfforts))),
    }),
    z.object({
      name: z.literal(models[2].name),
      reasoningEfforts: z.optional(z.array(z.enum(models[2].reasoningEfforts))),
    }),
    z.object({
      name: z.literal(models[3].name),
      reasoningEfforts: z.optional(z.array(z.enum(models[3].reasoningEfforts))),
    }),
    z.object({
      name: z.literal(models[4].name),
      reasoningEfforts: z.optional(z.array(z.enum(models[4].reasoningEfforts))),
    }),
    z.object({
      name: z.literal(models[5].name),
      reasoningEfforts: z.optional(z.array(z.enum(models[5].reasoningEfforts))),
    }),
    z.object({
      name: z.literal(models[6].name),
      reasoningEfforts: z.optional(z.array(z.enum(models[6].reasoningEfforts))),
    }),
    z.object({
      name: z.literal(models[7].name),
      reasoningEfforts: z.optional(z.array(z.enum(models[7].reasoningEfforts))),
    }),
    z.object({
      name: z.literal(models[8].name),
      reasoningEfforts: z.optional(z.array(z.enum(models[8].reasoningEfforts))),
    }),
    z.object({
      name: z.literal(models[9].name),
      reasoningEfforts: z.optional(z.array(z.enum(models[9].reasoningEfforts))),
    }),
    z.object({
      name: z.literal(models[10].name),
      reasoningEfforts: z.optional(z.array(z.enum(models[10].reasoningEfforts))),
    }),
    z.object({
      name: z.literal(models[11].name),
      reasoningEfforts: z.optional(z.array(z.enum(models[11].reasoningEfforts))),
    }),
    z.object({
      name: z.literal(models[12].name),
      reasoningEfforts: z.optional(z.array(z.enum(models[12].reasoningEfforts))),
    }),
    z.object({
      name: z.literal(models[13].name),
      reasoningEfforts: z.optional(z.array(z.enum(models[13].reasoningEfforts))),
    }),
  ]),
)

type ModelVariantConfig = z.infer<typeof ModelVariantConfigSchema>

function getModelVariants(input: ModelVariantConfig): Array<ModelVariant<Model>> {
  return input.flatMap(config => {
    if (typeof config === 'string') {
      return [{name: config, reasoningEffort: 'medium'}]
    }

    if (!config.reasoningEfforts) {
      return [{name: config.name, reasoningEffort: 'medium'}]
    }

    if (config.reasoningEfforts.length === 0) {
      return [{name: config.name, reasoningEffort: 'medium'}]
    }

    return config.reasoningEfforts.map(effort => {
      return {name: config.name, reasoningEffort: effort}
    })
  })
}

export {models, getModelVariants}
export type {ModelConfig, Model, ReasoningEffort, ModelVariantConfig}
