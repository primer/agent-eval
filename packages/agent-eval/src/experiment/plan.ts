import {randomUUID} from 'node:crypto'
import * as z from 'zod/mini'
import type {BenchmarkTrial} from '../benchmark/plan'
import {CopilotRunnerSchema, type CopilotRunner} from '../copilot-runner'
import type {Host} from '../host'
import {ModelVariantSchema} from '../model'
import {createPlan, createPlanFromManifest, type Plan} from '../plan'
import type {Scenario} from '../scenario/scenario'
import {ControlTreatment, composeTreatmentSetup, createTreatment} from '../treatment'
import type {Trial} from '../trial/trial'
import type {BenchmarkExperiment, Experiment, ScenarioExperiment} from './experiment'
import {getExperiment} from './get'
import {ExperimentBenchmarkSchema, createExperimentBenchmark} from './benchmark'

type ExperimentPlan =
  | {
      type: 'scenarios'
      experiment: ScenarioExperiment
      plan: Plan<Trial>
    }
  | {
      type: 'benchmark'
      experiment: BenchmarkExperiment
      plan: Plan<BenchmarkTrial>
    }

type CreateExperimentPlanOptions = {
  experiment: Experiment
  runner?: CopilotRunner
}

function getExperimentTreatments(experiment: Experiment) {
  const treatments = new Map([[ControlTreatment.id, ControlTreatment]])
  const names = new Set([ControlTreatment.name])
  if (experiment.type === 'benchmark') {
    const treatment = createTreatment({
      name: 'Benchmark',
      setup: experiment.benchmark.setup,
    })
    treatments.set(treatment.id, treatment)
    names.add(treatment.name)
  }

  for (const treatment of experiment.treatments) {
    if (treatments.has(treatment.id) || names.has(treatment.name)) {
      throw new Error(`Experiment "${experiment.id}" contains duplicate treatment: ${treatment.name}`)
    }
    treatments.set(treatment.id, treatment)
    names.add(treatment.name)
  }

  return treatments
}

function createExperimentPlan({experiment, runner: selectedRunner}: CreateExperimentPlanOptions): ExperimentPlan {
  const treatments = [...getExperimentTreatments(experiment).values()]
  const runners = [
    ...new Set<CopilotRunner>(selectedRunner ? [selectedRunner] : (experiment.runners ?? ['copilot-cli'])),
  ]

  function expandEntries<T extends Pick<Trial, 'scenario' | 'setup'>>(entries: Array<T>): Plan<T & Trial> {
    return createPlan({
      trials: experiment.models.flatMap(model => {
        return entries.flatMap(entry => {
          return runners.flatMap(runner => {
            return treatments.map(treatment => {
              return {
                ...entry,
                id: randomUUID(),
                treatment,
                model,
                runner,
              }
            })
          })
        })
      }),
    })
  }

  if (experiment.type === 'benchmark') {
    return {
      type: 'benchmark',
      experiment,
      plan: expandEntries(
        experiment.benchmark.capabilities.flatMap(capability => {
          return capability.scenarios.map(scenario => {
            return {
              scenario,
              capability,
              setup: composeTreatmentSetup(capability.setup, experiment.setup),
            }
          })
        }),
      ),
    }
  }

  return {
    type: 'scenarios',
    experiment,
    plan: expandEntries(
      experiment.scenarios.map(scenario => {
        return {
          scenario,
          setup: experiment.setup,
        }
      }),
    ),
  }
}

const ScenarioTrialManifestSchema = z.strictObject({
  id: z.string(),
  model: ModelVariantSchema,
  runner: z._default(CopilotRunnerSchema, 'copilot-cli'),
  scenarioId: z.string(),
  treatmentId: z.string(),
})

type ScenarioTrialManifest = z.infer<typeof ScenarioTrialManifestSchema>

const BenchmarkTrialManifestSchema = z.extend(ScenarioTrialManifestSchema, {
  capabilityId: z.string(),
})

const ExperimentPlanManifestFileSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('scenarios'),
    id: z.string(),
    name: z.string(),
    trials: z.array(ScenarioTrialManifestSchema),
  }),
  z.strictObject({
    type: z.literal('benchmark'),
    id: z.string(),
    name: z.string(),
    benchmark: ExperimentBenchmarkSchema,
    trials: z.array(BenchmarkTrialManifestSchema),
  }),
])

type ExperimentPlanManifestFile = z.infer<typeof ExperimentPlanManifestFileSchema>

function createTrialManifest(trial: Trial): ScenarioTrialManifest {
  return {
    id: trial.id,
    model: trial.model,
    runner: trial.runner ?? 'copilot-cli',
    scenarioId: trial.scenario.id,
    treatmentId: trial.treatment.id,
  }
}

type CreateExperimentPlanManifestOptions = {
  plan: ExperimentPlan
}

function createExperimentPlanManifest({plan}: CreateExperimentPlanManifestOptions): ExperimentPlanManifestFile {
  const common = {
    id: plan.experiment.id,
    name: plan.experiment.name,
  }

  if (plan.type === 'benchmark') {
    return {
      ...common,
      type: 'benchmark',
      benchmark: createExperimentBenchmark(plan.experiment.benchmark),
      trials: plan.plan.trials.map(trial => {
        return {
          ...createTrialManifest(trial),
          capabilityId: trial.capability.id,
        }
      }),
    }
  }

  return {
    ...common,
    type: 'scenarios',
    trials: plan.plan.trials.map(createTrialManifest),
  }
}

function parseExperimentPlanManifestFile(contents: string): ExperimentPlanManifestFile {
  const legacyCompatibleSchema = z.pipe(
    z.transform((input: unknown) => {
      if (typeof input === 'object' && input !== null && !('type' in input)) {
        return {
          ...input,
          type: 'benchmark' in input ? 'benchmark' : 'scenarios',
        }
      }
      return input
    }),
    ExperimentPlanManifestFileSchema,
  )

  return legacyCompatibleSchema.parse(JSON.parse(contents))
}

type ParseExperimentPlanManifestOptions = {
  experimentsDirectory: string
  contents: string
  host?: Host
  scenariosDirectory: string
  benchmarksDirectory?: string
}

async function parseExperimentPlanManifest({
  experimentsDirectory,
  contents,
  host,
  scenariosDirectory,
  benchmarksDirectory,
}: ParseExperimentPlanManifestOptions): Promise<ExperimentPlan> {
  const result = parseExperimentPlanManifestFile(contents)
  const experiment = await getExperiment({
    experimentsDirectory,
    host,
    name: result.id,
    scenariosDirectory,
    benchmarksDirectory,
  })
  const treatments = getExperimentTreatments(experiment)
  const trialIds = new Set<string>()

  function restoreTrial(trial: ScenarioTrialManifest, scenario: Scenario): Trial {
    if (trialIds.has(trial.id)) {
      throw new Error(`Duplicate trial ID in experiment plan: ${trial.id}`)
    }
    trialIds.add(trial.id)

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
  }

  if (result.type === 'benchmark' && experiment.type === 'benchmark') {
    if (JSON.stringify(result.benchmark) !== JSON.stringify(createExperimentBenchmark(experiment.benchmark))) {
      throw new Error(`Benchmark definition changed for experiment plan: ${result.id}`)
    }

    const capabilities = new Map(
      experiment.benchmark.capabilities.map(capability => {
        return [capability.id, capability]
      }),
    )
    const trials = result.trials.map(trial => {
      const capability = capabilities.get(trial.capabilityId)
      const scenario = capability?.scenarios.find(candidate => {
        return candidate.id === trial.scenarioId
      })
      if (!capability || !scenario) {
        throw new Error(
          `Invalid capability "${trial.capabilityId}" for scenario "${trial.scenarioId}" in trial "${trial.id}"`,
        )
      }

      return {
        ...restoreTrial(trial, scenario),
        capability,
        setup: composeTreatmentSetup(capability.setup, experiment.setup),
      }
    })

    return {
      type: 'benchmark',
      experiment,
      plan: createPlanFromManifest({trials}),
    }
  }

  if (result.type === 'scenarios' && experiment.type === 'scenarios') {
    const scenarios = new Map(
      experiment.scenarios.map(scenario => {
        return [scenario.id, scenario]
      }),
    )
    const trials = result.trials.map(trial => {
      const scenario = scenarios.get(trial.scenarioId)
      if (!scenario) {
        throw new Error(`Scenario not found for trial: ${trial.id}`)
      }
      return restoreTrial(trial, scenario)
    })

    return {
      type: 'scenarios',
      experiment,
      plan: createPlanFromManifest({trials}),
    }
  }

  throw new Error(`Experiment source changed for experiment plan: ${result.id}`)
}

export {createExperimentPlan, createExperimentPlanManifest, parseExperimentPlanManifest, getExperimentTreatments}
export type {ExperimentPlan}
