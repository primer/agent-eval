import {randomUUID} from 'node:crypto'
import * as z from 'zod/mini'
import {CopilotRunnerSchema, type CopilotRunner} from '../copilot-runner'
import type {Host} from '../host'
import {ModelVariantSchema} from '../model'
import {createPlan, type Plan} from '../plan'
import {ControlTreatment} from '../treatment'
import type {Trial} from '../trial/trial'
import type {Experiment} from './experiment'
import {getExperiment} from './get'

type ExperimentTrial = Trial

type CreateExperimentPlanOptions = {
  experiment: Experiment
  runner?: CopilotRunner
}

function getExperimentTreatments(experiment: Experiment) {
  const treatments = new Map([[ControlTreatment.id, ControlTreatment]])
  const names = new Set([ControlTreatment.name])

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

  return createPlan({
    trials: experiment.models.flatMap(model => {
      return experiment.scenarios.flatMap(scenario => {
        return [...new Set<CopilotRunner>(runners)].flatMap(runner => {
          return treatments.map(treatment => {
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
}

const ExperimentPlanManifestFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  trials: z.array(
    z.object({
      id: z.string(),
      model: ModelVariantSchema,
      runner: z._default(CopilotRunnerSchema, 'copilot-cli'),
      scenarioId: z.string(),
      treatmentId: z.string(),
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
    trials: plan.trials.map(trial => {
      return {
        id: trial.id,
        model: trial.model,
        runner: trial.runner ?? 'copilot-cli',
        scenarioId: trial.scenario.id,
        treatmentId: trial.treatment.id,
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
}

async function parseExperimentPlanManifest({
  experimentsDirectory,
  contents,
  host,
  scenariosDirectory,
}: ParseExperimentPlanManifestOptions): Promise<ExperimentPlanManifest> {
  const result = ExperimentPlanManifestFileSchema.parse(JSON.parse(contents))
  const experiment = await getExperiment({
    experimentsDirectory,
    host,
    name: result.id,
    scenariosDirectory,
  })
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
}

export {createExperimentPlan, createExperimentPlanManifest, parseExperimentPlanManifest}
export type {ExperimentTrial}
