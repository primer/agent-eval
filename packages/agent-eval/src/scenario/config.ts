import * as z from 'zod/mini'
import {CheckConfigSchema} from '../check'
import {JudgeConfigSchema} from '../judge'
import {ScenarioImageSchema} from './image-config'

const ScenarioConfigSchema = z.object({
  description: z.optional(z.string()),
  prompt: z.string(),
  image: z.optional(ScenarioImageSchema),
  tags: z._default(z.array(z.string()), []),
  checks: z._default(z.array(CheckConfigSchema), []),
  judges: z._default(z.array(JudgeConfigSchema), []),
})

type ScenarioConfig = z.output<typeof ScenarioConfigSchema>

type ScenarioConfigModule = {
  default?: unknown
}

function defineConfig(config: z.input<typeof ScenarioConfigSchema>): ScenarioConfig {
  return ScenarioConfigSchema.parse(config)
}

export {ScenarioConfigSchema, defineConfig}
export type {ScenarioConfig, ScenarioConfigModule}
