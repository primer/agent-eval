import * as z from 'zod/mini'
import {ModelVariantConfigSchema, type ModelVariantConfig} from '../model'
import {CopilotRunnerSchema, type CopilotRunner} from '../copilot-runner'
import {
  ControlTreatment,
  TreatmentConfigSchema,
  TreatmentSetupSchema,
  type TreatmentConfig,
  type TreatmentSetup,
} from '../treatment'

type InlineScenarioConfig = {
  name?: string
  path: string
}

type ExperimentOptions = {
  name: string
  description: string
  models: Array<ModelVariantConfig>
  runners?: Array<CopilotRunner>
  setup?: TreatmentSetup
  treatments: Array<TreatmentConfig>
}

type ExperimentConfig = ExperimentOptions &
  ({scenarios: Array<string | InlineScenarioConfig>; benchmark?: never} | {benchmark: string; scenarios?: never})

const InlineScenarioConfigSchema = z.object({
  name: z.optional(z.string()),
  path: z.string(),
}) satisfies z.ZodMiniType<InlineScenarioConfig>

const ExperimentOptionsSchema = z.object({
  name: z.string(),
  description: z.string(),
  models: z.array(ModelVariantConfigSchema),
  runners: z.optional(z.array(CopilotRunnerSchema).check(z.minLength(1))),
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

const ExperimentConfigSchema = z.union([
  z.extend(ExperimentOptionsSchema, {
    scenarios: z.array(z.union([z.string(), InlineScenarioConfigSchema])),
    benchmark: z.optional(z.never()),
  }),
  z.extend(ExperimentOptionsSchema, {
    benchmark: z.string().check(z.minLength(1)),
    scenarios: z.optional(z.never()),
    treatments: z.array(TreatmentConfigSchema).check(
      z.refine(
        treatments => {
          const names = new Set([ControlTreatment.name, 'Benchmark'])
          for (const treatment of treatments) {
            if (names.has(treatment.name)) {
              return false
            }
            names.add(treatment.name)
          }
          return true
        },
        {message: 'Treatment names must be unique and cannot use the reserved names "Control" or "Benchmark"'},
      ),
    ),
  }),
]) satisfies z.ZodMiniType<ExperimentConfig>

function defineConfig(config: ExperimentConfig): ExperimentConfig {
  return config
}

export {ExperimentConfigSchema, InlineScenarioConfigSchema, defineConfig}
export type {ExperimentConfig}
