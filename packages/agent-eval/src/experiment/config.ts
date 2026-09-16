import * as z from 'zod/mini'
import {ModelVariantConfigSchema} from '../model'
import {CopilotRunnerSchema} from '../copilot-runner'
import {ControlTreatment, TreatmentConfigSchema, TreatmentSetupSchema} from '../treatment'

const InlineScenarioConfigSchema = z.object({
  name: z.optional(z.string()),
  path: z.string(),
})

const ExperimentConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  models: z.array(ModelVariantConfigSchema),
  runners: z.optional(z.array(CopilotRunnerSchema).check(z.minLength(1))),
  scenarios: z.array(z.union([z.string(), InlineScenarioConfigSchema])),
  setup: z.optional(TreatmentSetupSchema),
  treatments: z.array(TreatmentConfigSchema).check(
    z.refine(
      treatments => {
        const names = new Set<string>([ControlTreatment.name])
        for (const treatment of treatments) {
          if (names.has(treatment.name)) {
            return false
          }
          names.add(treatment.name)
        }
        return true
      },
      {
        message: 'Treatment names must be unique and cannot use the reserved name "Control"',
      },
    ),
  ),
})

type ExperimentConfig = z.infer<typeof ExperimentConfigSchema>

function defineConfig(config: ExperimentConfig): ExperimentConfig {
  return config
}

export {ExperimentConfigSchema, InlineScenarioConfigSchema, defineConfig}
export type {ExperimentConfig}
