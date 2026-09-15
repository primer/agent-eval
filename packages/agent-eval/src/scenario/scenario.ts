import * as z from 'zod/mini'
import {CheckConfigSchema} from '../check'
import {JudgeSchema} from '../judge'

const ScenarioSchema = z.object({
  id: z.string(),
  directory: z.string(),
  prompt: z.string(),
  description: z.optional(z.string()),
  tags: z._default(z.array(z.string()), []),
  checks: z._default(z.array(CheckConfigSchema), []),
  judges: z._default(z.array(JudgeSchema), []),
})

type Scenario = z.infer<typeof ScenarioSchema>

export {ScenarioSchema}
export type {Scenario}
