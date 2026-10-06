import * as z from 'zod/mini'
import {hash} from './hash'
import {SandboxSchema, type Sandbox} from './sandbox'

type TreatmentSetupOptions = {
  sandbox: Sandbox
}

type TreatmentSetup = (options: TreatmentSetupOptions) => Promise<void>

const TreatmentSetupSchema = z.function({
  input: [
    z.object({
      sandbox: SandboxSchema,
    }),
  ],
  output: z.promise(z.void()),
}) satisfies z.ZodMiniType<TreatmentSetup>

const TreatmentConfigSchema = z.object({
  name: z.string(),
  setup: z.optional(TreatmentSetupSchema),
})

type TreatmentConfig = z.infer<typeof TreatmentConfigSchema>

const TreatmentSchema = z.extend(TreatmentConfigSchema, {
  id: z.string(),
})

type Treatment = z.infer<typeof TreatmentSchema>

function createTreatment(config: TreatmentConfig): Treatment {
  return {
    ...config,
    id: getTreatmentId(config.name),
  }
}

const ControlTreatment = createTreatment({
  name: 'Control',
})

function getTreatmentId(name: string): string {
  return hash(`Treatment:${name}`)
}

function composeTreatmentSetup(...setups: Array<TreatmentSetup | undefined>): TreatmentSetup | undefined {
  const callbacks = setups.filter((setup): setup is TreatmentSetup => {
    return setup !== undefined
  })
  if (callbacks.length === 0) {
    return undefined
  }
  if (callbacks.length === 1) {
    return callbacks[0]
  }
  return async options => {
    for (const setup of callbacks) {
      await setup(options)
    }
  }
}

export {
  ControlTreatment,
  TreatmentConfigSchema,
  TreatmentSchema,
  TreatmentSetupSchema,
  createTreatment,
  getTreatmentId,
  composeTreatmentSetup,
}
export type {TreatmentConfig, Treatment, TreatmentSetup}
