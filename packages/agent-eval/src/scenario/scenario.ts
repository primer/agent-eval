import * as z from 'zod/mini'
import {CheckSchema} from '../check'
import {JudgeSchema} from '../judge'
import {ScenarioImageSchema} from './image-config'

const ScenarioSchema = z.object({
  id: z.string(),
  directory: z.string(),
  prompt: z.string(),
  image: z.optional(ScenarioImageSchema),
  description: z.optional(z.string()),
  tags: z._default(z.array(z.string()), []),
  checks: z._default(z.array(CheckSchema), []),
  judges: z._default(z.array(JudgeSchema), []),
})

type Scenario = z.infer<typeof ScenarioSchema>

export {ScenarioSchema}
export type {Scenario}
