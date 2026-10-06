import {randomUUID} from 'node:crypto'
import * as z from 'zod/mini'
import {CopilotRunnerSchema, type CopilotRunner} from '../copilot-runner'
import type {Host} from '../host'
import {ModelVariantSchema} from '../model'
import {createPlan, type Plan} from '../plan'
import {ControlTreatment, composeTreatmentSetup, createTreatment} from '../treatment'
import type {Trial} from '../trial/trial'
import type {Experiment} from './experiment'
import {getExperiment} from './get'
import type {Capability} from '../benchmark/benchmark'
import {ExperimentBenchmarkSchema, getExperimentBenchmark} from './benchmark'

type ExperimentTrial = Trial & {capability?: Capability}

type CreateExperimentPlanOptions = {
  experiment: Experiment
  runner?: CopilotRunner
}

function getExperimentTreatments(experiment: Experiment) {
  const treatments = new Map([[ControlTreatment.id, ControlTreatment]])
  const names = new Set([ControlTreatment.name])
  if (experiment.benchmark) {
    const treatment = createTreatment({name: 'Benchmark', setup: experiment.benchmark.setup})
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

function createExperimentPlan({
  experiment,
  runner: selectedRunner,
}: CreateExperimentPlanOptions): Plan<ExperimentTrial> {
  const treatments = [...getExperimentTreatments(experiment).values()]
  const runners = selectedRunner ? [selectedRunner] : (experiment.runners ?? ['copilot-cli'])
  const entries = experiment.benchmark
    ? experiment.benchmark.capabilities.flatMap(capability => {
        return capability.scenarios.map(scenario => {
          return {scenario, capability}
        })
      })
    : experiment.scenarios.map(scenario => {
        return {scenario, capability: undefined}
      })

  return createPlan({
    trials: experiment.models.flatMap(model => {
      return entries.flatMap(({scenario, capability}) => {
        return [...new Set<CopilotRunner>(runners)].flatMap(runner => {
          return treatments.map(treatment => {
            return {
              id: randomUUID(),
              scenario,
              treatment,
              model,
              runner,
              ...(capability ? {capability} : {}),
              setup: composeTreatmentSetup(capability?.setup, experiment.setup),
            }
          })
        })
      })
    }),
  })
}

const ExperimentPlanManifestFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  benchmark: z.optional(ExperimentBenchmarkSchema),
  trials: z.array(
    z.object({
      id: z.string(),
      model: ModelVariantSchema,
      runner: z._default(CopilotRunnerSchema, 'copilot-cli'),
      scenarioId: z.string(),
      treatmentId: z.string(),
      capabilityId: z.optional(z.string()),
    }),
  ),
})

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
    benchmark: getExperimentBenchmark(experiment),
    trials: plan.trials.map(trial => {
      return {
        id: trial.id,
        model: trial.model,
        runner: trial.runner ?? 'copilot-cli',
        scenarioId: trial.scenario.id,
        treatmentId: trial.treatment.id,
        capabilityId: trial.capability?.id,
      }
    }),
  }
}

type ExperimentPlanManifest = {
  experiment: Experiment
  trials: Array<ExperimentTrial>
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
}: ParseExperimentPlanManifestOptions): Promise<ExperimentPlanManifest> {
  const result = ExperimentPlanManifestFileSchema.parse(JSON.parse(contents))
  const experiment = await getExperiment({
    experimentsDirectory,
    host,
    name: result.id,
    scenariosDirectory,
    benchmarksDirectory,
  })
  if (JSON.stringify(result.benchmark) !== JSON.stringify(getExperimentBenchmark(experiment))) {
    throw new Error(`Benchmark definition changed for experiment plan: ${result.id}`)
  }
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

      const capability = experiment.benchmark?.capabilities.find(candidate => {
        return candidate.id === trial.capabilityId
      })
      if (
        experiment.benchmark &&
        (!capability ||
          !capability.scenarios.some(scenario => {
            return scenario.id === trial.scenarioId
          }))
      ) {
        throw new Error(
          `Invalid capability "${trial.capabilityId}" for scenario "${trial.scenarioId}" in trial "${trial.id}"`,
        )
      }
      if (!experiment.benchmark && trial.capabilityId !== undefined) {
        throw new Error(`Unexpected capability in scenario experiment trial: ${trial.id}`)
      }
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
        ...(capability ? {capability} : {}),
        setup: composeTreatmentSetup(capability?.setup, experiment.setup),
      }
    }),
  }
}

export {createExperimentPlan, createExperimentPlanManifest, parseExperimentPlanManifest, getExperimentTreatments}
export type {ExperimentTrial}
