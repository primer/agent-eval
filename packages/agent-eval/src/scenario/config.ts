import * as z from 'zod/mini'
import {CheckConfigSchema} from '../check'
import {JudgeConfigSchema} from '../judge'

const ScenarioConfigSchema = z.object({
  description: z.optional(z.string()),
  prompt: z.string(),
  tags: z._default(z.array(z.string()), []),
  checks: z._default(z.array(CheckConfigSchema), []),
  judges: z._default(z.array(JudgeConfigSchema), []),
})

// Keep declaration emit from expanding the inferred schema into internal types.
type ScenarioConfig = {
  [Key in keyof z.output<typeof ScenarioConfigSchema>]: z.output<typeof ScenarioConfigSchema>[Key]
}

type ScenarioConfigModule = {
  default?: unknown
}

function defineConfig(config: z.input<typeof ScenarioConfigSchema>): ScenarioConfig {
  return ScenarioConfigSchema.parse(config)
}

export {ScenarioConfigSchema, defineConfig}
export type {ScenarioConfig, ScenarioConfigModule}
