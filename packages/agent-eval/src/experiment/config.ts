import * as z from 'zod/mini'
import {ModelVariantConfigSchema} from '../model'
import {ControlTreatment, TreatmentConfigSchema, TreatmentSetupSchema} from '../treatment'

const InlineScenarioConfigSchema = z.object({
  name: z.optional(z.string()),
  path: z.string(),
})

const ExperimentConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  models: z.array(ModelVariantConfigSchema),
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

function defineConfig<const Config extends ExperimentConfig>(config: Config): Config {
  return config
}

export {ExperimentConfigSchema, InlineScenarioConfigSchema, defineConfig}
export type {ExperimentConfig}
