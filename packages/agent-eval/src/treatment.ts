import * as z from 'zod/mini'
import {SandboxSchema} from './sandbox'

const TreatmentSetupSchema = z.function({
  input: [
    z.object({
      sandbox: SandboxSchema,
    }),
  ],
  output: z.promise(z.void()),
})

type TreatmentSetup = z.infer<typeof TreatmentSetupSchema>

const TreatmentSchema = z.object({
  name: z.string(),
  setup: z.optional(TreatmentSetupSchema),
})

type Treatment = z.infer<typeof TreatmentSchema>

const ControlTreatment: Treatment = {
  name: 'Control',
}

export {ControlTreatment, TreatmentSchema, TreatmentSetupSchema}
export type {Treatment, TreatmentSetup}
