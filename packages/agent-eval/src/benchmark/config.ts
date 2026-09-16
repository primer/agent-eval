import * as z from 'zod/mini'
import {TreatmentSetupSchema, type TreatmentSetup} from '../treatment'
import {ModelVariantConfigSchema, type ModelVariantConfig} from '../model'

type CapabilityConfig = {
  name: string
  scenarios: Array<string>
  setup?: TreatmentSetup
}

type BenchmarkConfig = {
  name: string
  description: string
  models: Array<ModelVariantConfig>
  setup?: TreatmentSetup
  capabilities: Array<CapabilityConfig>
}

const CapabilityConfigSchema = z.object({
  name: z.string(),
  scenarios: z.array(z.string()),
  setup: z.optional(TreatmentSetupSchema),
}) satisfies z.ZodMiniType<CapabilityConfig>

const BenchmarkConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  models: z.array(ModelVariantConfigSchema),
  setup: z.optional(TreatmentSetupSchema),
  capabilities: z.array(CapabilityConfigSchema).check(
    z.refine(
      capabilities => {
        const names = new Set<string>()
        for (const capability of capabilities) {
          if (names.has(capability.name)) {
            return false
          }
          names.add(capability.name)
        }
        return true
      },
      {
        message: 'Capability names must be unique',
      },
    ),
  ),
}) satisfies z.ZodMiniType<BenchmarkConfig>

function defineConfig(config: BenchmarkConfig): BenchmarkConfig {
  return config
}

export {BenchmarkConfigSchema, CapabilityConfigSchema, defineConfig}
export type {BenchmarkConfig}
