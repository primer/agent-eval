import * as z from 'zod/mini'
import {CheckConfigSchema, type CheckConfig} from '../check'
import {JudgeConfigSchema, type JudgeConfig} from '../judge'

type ScenarioConfig = {
  description?: string
  prompt: string
  tags: Array<string>
  checks: Array<CheckConfig>
  judges: Array<JudgeConfig>
}

const ScenarioConfigSchema = z.object({
  description: z.optional(z.string()),
  prompt: z.string(),
  tags: z._default(z.array(z.string()), []),
  checks: z._default(z.array(CheckConfigSchema), []),
  judges: z._default(z.array(JudgeConfigSchema), []),
}) satisfies z.ZodMiniType<ScenarioConfig>

type ScenarioConfigModule = {
  default?: unknown
}

function defineConfig(config: z.input<typeof ScenarioConfigSchema>): ScenarioConfig {
  return ScenarioConfigSchema.parse(config)
}

export {ScenarioConfigSchema, defineConfig}
export type {ScenarioConfig, ScenarioConfigModule}
