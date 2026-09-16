import * as z from 'zod/mini'
import {CheckSchema, type Check} from '../check'
import {JudgeSchema, type Judge} from '../judge'

type Scenario = {
  id: string
  directory: string
  prompt: string
  description?: string
  tags: Array<string>
  checks: Array<Check>
  judges: Array<Judge>
}

const ScenarioSchema = z.object({
  id: z.string(),
  directory: z.string(),
  prompt: z.string(),
  description: z.optional(z.string()),
  tags: z._default(z.array(z.string()), []),
  checks: z._default(z.array(CheckSchema), []),
  judges: z._default(z.array(JudgeSchema), []),
}) satisfies z.ZodMiniType<Scenario>

export {ScenarioSchema}
export type {Scenario}
