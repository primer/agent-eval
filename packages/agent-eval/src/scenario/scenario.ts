import * as z from 'zod/mini'
import {JudgeSchema} from '../judge'

const ScenarioSchema = z.object({
  id: z.string(),
  directory: z.string(),
  prompt: z.string(),
  description: z.optional(z.string()),
  tags: z.array(z.string()),
  testPath: z.string(),
  browserTestPath: z.optional(z.string()),
  judges: z.array(JudgeSchema),
})

type Scenario = z.infer<typeof ScenarioSchema>

export {ScenarioSchema}
export type {Scenario}
