import * as z from 'zod/mini'
import {ModelVariantSchema} from './model'
import {ScenarioConfigSchema, ScenarioSchema} from './scenario'
import {TreatmentSchema, TreatmentSetupSchema} from './treatment'

const TrialSchema = z.object({
  id: z.string(),
  scenario: ScenarioSchema,
  treatment: TreatmentSchema,
  model: ModelVariantSchema,
  setup: z.optional(TreatmentSetupSchema),
})

type Trial = z.infer<typeof TrialSchema>

export {TrialSchema}
export type {Trial}
