import * as z from 'zod/mini'
import {CheckConfigSchema} from '../check'
import {JudgeConfigSchema} from '../judge'

const ScenarioConfigSchema = z.object({
  description: z.optional(z.string()),
  prompt: z.string(),
  tags: z._default(z.optional(z.array(z.string())), []),
  checks: z.optional(z.array(CheckConfigSchema)),
  judges: z._default(z.optional(z.array(JudgeConfigSchema)), []),
})

type ScenarioConfig = z.infer<typeof ScenarioConfigSchema>

type ScenarioConfigModule = {
  default?: unknown
}

function defineConfig(config: ScenarioConfig): ScenarioConfig {
  return config
}

export {ScenarioConfigSchema, defineConfig}
export type {ScenarioConfig, ScenarioConfigModule}
