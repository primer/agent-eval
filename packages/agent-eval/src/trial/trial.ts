import * as z from 'zod/mini'
import {ScenarioSchema} from '../scenario'
import {ModelVariantSchema} from '../model'
import {TreatmentSchema, TreatmentSetupSchema} from '../treatment'
// import type {Host} from '../host'
// import type Queue from 'p-queue'
// import type {Sandbox} from '../sandbox'
// import {logger} from '../logger'
//
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

// type RunTrialOptions = {
//   artifactsDirectory: string
//   copilotToken: string
//   copilotQueue: Queue
//   host?: Host
//   sandbox: Sandbox
//   trial: Trial
// }
//
// type TrialResult = {}
//
// async function runTrial({host, trial}: RunTrialOptions): Promise<TrialResult> {
//   const logPrefix = `[${trial.scenario.id}] [${trial.treatment.name}] [${trial.model.name} (${trial.model.reasoningEffort})]`
//   logger.info('%s Running trial: %s', logPrefix, trial.id)
//
//   throw new Error('unimplemented')
// }
//
// export {runTrial}
// export type {TrialResult}
