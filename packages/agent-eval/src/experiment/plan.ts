import {randomUUID} from 'node:crypto'
import * as z from 'zod/mini'
import {CopilotRunnerSchema} from '../copilot-runner'
import type {Host} from '../host'
import {ModelVariantSchema} from '../model'
import {createPlan, type Plan} from '../plan'
import {composeTreatmentSetup, ControlTreatment, createTreatment} from '../treatment'
import type {Trial} from '../trial/trial'
import type {Experiment} from './experiment'
import {getExperiment} from './get'
import {exhaustiveCheck} from '../exhaustive'
import type {Capability} from '../benchmark/benchmark'

type BenchmarkTrial = Trial & {
  capability: Capability
}

type ScenarioTrial = Trial

type ExperimentTrial = Trial | BenchmarkTrial

type CreateExperimentPlanOptions = {
  experiment: Experiment
}

function createExperimentPlan({experiment}: CreateExperimentPlanOptions): Plan<ScenarioTrial> | Plan<BenchmarkTrial> {
  if (experiment.type === 'scenario') {
    return createPlan({
      trials: experiment.models.flatMap(model => {
        return experiment.scenarios.flatMap(scenario => {
          return experiment.runners.flatMap(runner => {
            return experiment.treatments.map(treatment => {
              return {
                id: randomUUID(),
                scenario,
                treatment,
                model,
                runner,
                setup: experiment.setup,
              }
            })
          })
        })
      }),
    })
  } else if (experiment.type === 'benchmark') {
    return createPlan({
      trials: experiment.models.flatMap(model => {
        return experiment.runners.flatMap(runner => {
          return experiment.benchmark.capabilities.flatMap(capability => {
            return capability.scenarios.flatMap(scenario => {
              return [
                // Control
                {
                  id: randomUUID(),
                  scenario,
                  treatment: ControlTreatment,
                  model,
                  runner,
                  capability,
                },

                // Benchmark
                {
                  id: randomUUID(),
                  scenario,
                  treatment: createTreatment({
                    name: 'Benchmark',
                    setup: composeTreatmentSetup(experiment.benchmark.setup, capability.setup),
                  }),
                  model,
                  runner,
                  capability,
                },

                // Treatments
                ...experiment.treatments.map(treatment => {
                  return {
                    id: randomUUID(),
                    scenario,
                    treatment,
                    model,
                    runner,
                    capability,
                    setup: experiment.setup,
                  }
                }),
              ]
            })
          })
        })
      }),
    })
  } else {
    exhaustiveCheck(experiment)
  }
}

const BenchmarkExperimentPlanManifestFileSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  trials: z.array(
    z.object({
      id: z.string(),
      model: ModelVariantSchema,
      runner: CopilotRunnerSchema,
      scenarioId: z.string(),
      capabilityId: z.string(),
    }),
  ),
})

const ScenarioExperimentPlanManifestFileSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  trials: z.array(
    z.object({
      id: z.string(),
      model: ModelVariantSchema,
      runner: CopilotRunnerSchema,
      scenarioId: z.string(),
      treatmentId: z.string(),
    }),
  ),
})

const ExperimentPlanManifestFileSchema = z.union([
  BenchmarkExperimentPlanManifestFileSchema,
  ScenarioExperimentPlanManifestFileSchema,
])

type ExperimentPlanManifestFile = z.infer<typeof ExperimentPlanManifestFileSchema>

type CreateExperimentPlanManifestOptions = {
  experiment: Experiment
  plan: Plan<ExperimentTrial>
}

function createExperimentPlanManifest({
  experiment,
  plan,
}: CreateExperimentPlanManifestOptions): ExperimentPlanManifestFile {
  return {
    id: experiment.id,
    name: experiment.name,
    trials: plan.trials.map(trial => {
      if ('capability' in trial) {
        return {
          id: trial.id,
          model: trial.model,
          runner: trial.runner ?? 'copilot-cli',
          scenarioId: trial.scenario.id,
          capabilityId: trial.capability.id,
          treatmentId: trial.treatment.id,
        }
      } else if ('scenario' in trial) {
        return {
          id: trial.id,
          model: trial.model,
          runner: trial.runner ?? 'copilot-cli',
          scenarioId: trial.scenario.id,
          treatmentId: trial.treatment.id,
        }
      } else {
        exhaustiveCheck(trial)
      }
    }),
  }
}

type ExperimentPlanManifest = {
  experiment: Experiment
  trials: Array<ExperimentTrial>
}

type ParseExperimentPlanManifestOptions = {
  benchmarksDirectory: string
  experimentsDirectory: string
  contents: string
  host?: Host
  scenariosDirectory: string
}

async function parseExperimentPlanManifest({
  benchmarksDirectory,
  experimentsDirectory,
  contents,
  host,
  scenariosDirectory,
}: ParseExperimentPlanManifestOptions): Promise<ExperimentPlanManifest> {
  const result = ExperimentPlanManifestFileSchema.parse(JSON.parse(contents))
  const experiment = await getExperiment({
    benchmarksDirectory,
    experimentsDirectory,
    host,
    name: result.id,
    scenariosDirectory,
  })
  if (experiment.type === 'scenario') {
    const scenarios = new Map(
      experiment.scenarios.map(scenario => {
        return [scenario.id, scenario]
      }),
    )
    const treatments = getExperimentTreatments(experiment)
    const trialIds = new Set<string>()

    return {
      experiment,
      trials: result.trials.map(trial => {
        if (trialIds.has(trial.id)) {
          throw new Error(`Duplicate trial ID in experiment plan: ${trial.id}`)
        }
        trialIds.add(trial.id)

        const scenario = scenarios.get(trial.scenarioId)
        if (!scenario) {
          throw new Error(`Scenario not found for trial: ${trial.id}`)
        }

        const treatment = treatments.get(trial.treatmentId)
        if (!treatment) {
          throw new Error(`Treatment not found for trial: ${trial.id}`)
        }

        const model = experiment.models.find(candidate => {
          return candidate.name === trial.model.name && candidate.reasoningEffort === trial.model.reasoningEffort
        })
        if (!model) {
          throw new Error(`Model variant not found for trial: ${trial.id}`)
        }

        return {
          id: trial.id,
          model,
          runner: trial.runner,
          scenario,
          treatment,
          setup: experiment.setup,
        }
      }),
    }
  } else if (experiment.type === 'benchmark') {
    const capabilities = new Map(
      experiment.benchmark.capabilities.map(capability => {
        return [capability.id, capability]
      }),
    )
    const trialIds = new Set<string>()

    return {
      experiment,
      trials: result.trials.map(trial => {
        if (trialIds.has(trial.id)) {
          throw new Error(`Duplicate trial ID in experiment plan: ${trial.id}`)
        }
        trialIds.add(trial.id)

        const capability = capabilities.get(trial.capabilityId)
        if (!capability) {
          throw new Error(`Capability not found for trial: ${trial.id}`)
        }

        const scenario = capability.scenarios.find(candidate => {
          return candidate.id === trial.scenarioId
        })
        if (!scenario) {
          throw new Error(`Scenario not found for trial: ${trial.id}`)
        }

        const model = experiment.models.find(candidate => {
          return candidate.name === trial.model.name && candidate.reasoningEffort === trial.model.reasoningEffort
        })
        if (!model) {
          throw new Error(`Model variant not found for trial: ${trial.id}`)
        }

        const treatment = experiment.treatments.find(candidate => {
          return candidate.id === trial.treatmentId
        })
        if (!treatment) {
          throw new Error(`Treatment not found for trial: ${trial.id}`)
        }

        return {
          id: trial.id,
          model,
          runner: trial.runner,
          scenario,
          capability,
          treatment,
          setup: experiment.setup,
        }
      }),
    }
  } else {
    exhaustiveCheck(experiment)
  }
}

export {createExperimentPlan, createExperimentPlanManifest, parseExperimentPlanManifest}
export type {ExperimentTrial}
