import * as z from 'zod/mini'
import {CopilotRunnerSchema} from '../copilot-runner'
import {ScenarioSchema} from '../scenario/scenario'
import {ModelVariantSchema} from '../model'
import {TreatmentSchema, TreatmentSetupSchema} from '../treatment'

const TrialSchema = z.object({
  id: z.string(),
  scenario: ScenarioSchema,
  treatment: TreatmentSchema,
  model: ModelVariantSchema,
  runner: CopilotRunnerSchema,
  setup: z.optional(TreatmentSetupSchema),
})

type Trial = z.infer<typeof TrialSchema>

export {TrialSchema}
export type {Trial}
