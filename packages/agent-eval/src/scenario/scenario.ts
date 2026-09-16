import * as z from 'zod/mini'
import {CheckSchema} from '../check'
import {JudgeSchema} from '../judge'

const ScenarioSchema = z.object({
  id: z.string(),
  directory: z.string(),
  prompt: z.string(),
  description: z.optional(z.string()),
  tags: z._default(z.array(z.string()), []),
  checks: z._default(z.array(CheckSchema), []),
  judges: z._default(z.array(JudgeSchema), []),
})

// Keep declaration emit from expanding the inferred schema into internal types.
type Scenario = {
  [Key in keyof z.infer<typeof ScenarioSchema>]: z.infer<typeof ScenarioSchema>[Key]
}

export {ScenarioSchema}
export type {Scenario}
