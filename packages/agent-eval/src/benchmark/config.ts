import path from 'node:path'
import * as z from 'zod/mini'
import {TreatmentSetupSchema} from '../treatment'
import {ModelVariantConfigSchema} from '../model'
import {CopilotRunnerConfigSchema} from '../copilot-runner'
import {InlineScenarioConfigSchema} from '../experiment/config'

const CapabilityConfigSchema = z.object({
  name: z.string(),
  scenarios: z.array(z.union([z.string(), InlineScenarioConfigSchema])).check(
    z.minLength(1),
    z.refine(
      scenarios => {
        const names = new Set<string>()

        for (const scenario of scenarios) {
          if (typeof scenario === 'string') {
            if (names.has(scenario)) {
              return false
            }
            names.add(scenario)
          } else if ('name' in scenario && typeof scenario.name === 'string') {
            if (names.has(scenario.name)) {
              return false
            }
            names.add(scenario.name)
          } else {
            const name = path.basename(scenario.path, path.extname(scenario.path))
            if (names.has(name)) {
              return false
            }
            names.add(name)
          }
        }

        return true
      },
      {
        message: 'Scenario names must be unique within a capability',
      },
    ),
  ),
  setup: z.optional(TreatmentSetupSchema),
})

const BenchmarkConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  models: z.array(ModelVariantConfigSchema),
  runners: CopilotRunnerConfigSchema,
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

function defineConfig(config: z.input<typeof BenchmarkConfigSchema>): BenchmarkConfig {
  return BenchmarkConfigSchema.parse(config)
}

export {BenchmarkConfigSchema, CapabilityConfigSchema, defineConfig}
export type {BenchmarkConfig}
