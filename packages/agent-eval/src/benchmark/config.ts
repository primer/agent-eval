import * as z from 'zod/mini'
import {TreatmentSetupSchema} from '../treatment'
import {ModelVariantConfigSchema} from '../model'

const CapabilityConfigSchema = z.object({
  name: z.string(),
  scenarios: z.array(z.string()),
  setup: z.optional(TreatmentSetupSchema),
})

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
})

type BenchmarkConfig = z.infer<typeof BenchmarkConfigSchema>

function defineConfig(config: BenchmarkConfig): BenchmarkConfig {
  return config
}

export {BenchmarkConfigSchema, CapabilityConfigSchema, defineConfig}
export type {BenchmarkConfig}
