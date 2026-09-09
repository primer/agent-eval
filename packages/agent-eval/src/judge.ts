import * as z from 'zod/mini'
import {ModelVariantConfigSchema} from './model'

const JudgeConfigSchema = z.object({
  name: z.string(),
  description: z.optional(z.string()),
  judge: z.object({
    model: z.optional(ModelVariantConfigSchema),
    instructions: z.optional(z.string()),
  }),
  scores: z.array(
    z.object({
      value: z.number(),
      description: z.string(),
    }),
  ),
})

type JudgeConfig = z.infer<typeof JudgeConfigSchema>

const JudgeResultSchema = z.object({
  score: z.number(),
  rational: z.string(),
  findings: z.array(
    z.object({
      filepath: z.string(),
      snippet: z.string(),
      explanation: z.string(),
    }),
  ),
})

type JudgeResult = z.infer<typeof JudgeResultSchema>

const JudgeOutputSchema = z.object({
  config: JudgeConfigSchema,
  result: JudgeResultSchema,
})

type JudgeOutput = z.infer<typeof JudgeOutputSchema>

export {JudgeConfigSchema, JudgeResultSchema, JudgeOutputSchema}
export type {JudgeConfig, JudgeResult, JudgeOutput}
