import * as z from 'zod/mini'
import {ModelVariantConfigSchema} from '../model'
import {CopilotRunnerSchema} from '../copilot-runner'
import {ControlTreatment, TreatmentConfigSchema, TreatmentSetupSchema} from '../treatment'

const InlineScenarioConfigSchema = z.strictObject({
  name: z.optional(z.string()),
  path: z.string(),
})

/**
 * The configuration for an inline scenario. These live outside of the scenarios
 * folder and the configuration provides an optional name and path to the folder
 * to use.
 */
type InlineScenarioConfig = z.infer<typeof InlineScenarioConfigSchema>

const ScenarioExperimentConfigSchema = z.strictObject({
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

/**
 * The configuration for a scenario experiment. These types of experiments will
 * run a set of treatments against a collection of scenarios.
 */
type ScenarioExperimentConfig = z.infer<typeof ScenarioExperimentConfigSchema>

const BenchmarkExperimentConfigSchema = z.strictObject({
  name: z.string(),
  description: z.string(),
  models: z.array(ModelVariantConfigSchema),
  runners: z.optional(z.array(CopilotRunnerSchema).check(z.minLength(1))),
  benchmark: z.string(),
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

/**
 * The configuration for a benchmark experiment. These types of experiments will
 * run a set of treatments using the scenarios from a benchmark.
 */
type BenchmarkExperimentConfig = z.infer<typeof BenchmarkExperimentConfigSchema>

const ExperimentConfigSchema = z.union([ScenarioExperimentConfigSchema, BenchmarkExperimentConfigSchema])

type ExperimentConfig = z.infer<typeof ExperimentConfigSchema>

function defineConfig(config: ExperimentConfig): ExperimentConfig {
  return config
}

export {ExperimentConfigSchema, InlineScenarioConfigSchema, defineConfig}
export type {ExperimentConfig, ScenarioExperimentConfig, BenchmarkExperimentConfig, InlineScenarioConfig}
