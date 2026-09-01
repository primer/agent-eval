import path from 'node:path'
import * as z from 'zod/mini'
import {ModelVariantConfigSchema, type ModelVariant, type ModelVariantConfig} from './model'
import {getScenario, type Scenario} from './scenario'
import {ControlTreatment, TreatmentSchema, TreatmentSetupSchema, type Treatment, type TreatmentSetup} from './treatment'
import {DefaultHost, type Host} from './host'
import type {EnvironmentConfig} from './environment'
import {logger} from './logger'
import {createPlan} from './plan'
import {run as runTrials} from './run'
import type {Trial} from './trial'
import {randomUUID} from 'node:crypto'

const ExperimentConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  models: z.array(ModelVariantConfigSchema),
  scenarios: z.array(z.string()),
  setup: z.optional(TreatmentSetupSchema),
  treatments: z.array(TreatmentSchema),
})

type ExperimentConfig = z.infer<typeof ExperimentConfigSchema>

function defineConfig(config: ExperimentConfig): ExperimentConfig {
  return config
}

type Experiment = {
  id: string
  filepath: string
  name: ExperimentConfig['name']
  description: ExperimentConfig['description']
  models: Array<ModelVariant>
  scenarios: Array<Scenario>
  setup?: TreatmentSetup
  treatments: Array<Treatment>
}

type ExperimentModule = {
  default?: unknown
  experiment?: unknown
}

const EXPERIMENT_FILE_EXTENSIONS = new Set(['.cjs', '.js', '.mjs', '.ts'])

async function listExperiments({
  host = DefaultHost,
  experimentsDirectory,
  scenariosDirectory,
}: {
  host?: Host
  experimentsDirectory: string
  scenariosDirectory: string
}): Promise<Array<Experiment>> {
  if (!host.existsSync(experimentsDirectory)) {
    throw new Error(`Experiments directory does not exist: ${experimentsDirectory}`)
  }

  const stats = await host.fs.stat(experimentsDirectory)
  if (!stats.isDirectory()) {
    throw new Error(`Experiments path is not a directory: ${experimentsDirectory}`)
  }

  const filenames = await host.fs.readdir(experimentsDirectory)
  const experiments: Array<Experiment> = []

  for (const filename of filenames) {
    if (
      filename.endsWith('.d.ts') ||
      filename === 'index.ts' ||
      !EXPERIMENT_FILE_EXTENSIONS.has(path.extname(filename))
    ) {
      continue
    }

    const filepath = path.join(experimentsDirectory, filename)
    const mod: ExperimentModule = await host.loadModule(filepath)
    const data = mod.experiment ?? mod.default
    if (!data) {
      continue
    }

    const parseResult = ExperimentConfigSchema.safeParse(data)
    if (!parseResult.success) {
      logger.warn(
        `Failed to parse experiment config for file: ${filepath}. Error: ${z.prettifyError(parseResult.error)}`,
      )
      continue
    }

    const {data: config} = parseResult
    const scenarios = await Promise.all(
      config.scenarios.map(scenario => {
        return getScenario(host, scenariosDirectory, scenario)
      }),
    )
    const id = path.basename(filename, path.extname(filename))
    const experiment: Experiment = {
      id,
      filepath,
      ...config,
      scenarios,
    }
    experiments.push(experiment)
  }

  return experiments
}

async function getExperiment({
  host = DefaultHost,
  experimentsDirectory,
  scenariosDirectory,
  id,
}: {
  host?: Host
  experimentsDirectory: string
  scenariosDirectory: string
  id: string
}): Promise<Experiment> {
  const experiments = await listExperiments({
    host,
    experimentsDirectory,
    scenariosDirectory,
  })
  const experiment = experiments.find(experiment => experiment.id === id)
  if (experiment) {
    return experiment
  }

  throw new Error(`Experiment "${id}" was not found in: ${experimentsDirectory}`)
}

async function run({env, host = DefaultHost, id}: {env: EnvironmentConfig; host?: Host; id: string}) {
  const experiment = await getExperiment({
    host,
    experimentsDirectory: env.experimentsDirectory,
    scenariosDirectory: env.scenariosDirectory,
    id,
  })
  const trials: Array<Trial> = experiment.models.flatMap(model => {
    return experiment.scenarios.flatMap(scenario => {
      return [
        {
          id: randomUUID(),
          scenario,
          treatment: ControlTreatment,
          model,
          setup: experiment.setup,
        },
        ...experiment.treatments.map(treatment => {
          return {
            id: randomUUID(),
            scenario,
            treatment,
            model,
            setup: experiment.setup,
          }
        }),
      ]
    })
  })
  const plan = await createPlan(trials)
  const results = await runTrials({
    env,
    host,
    plan,
  })
  console.log(results)

  // throw new Error('unimplemented')
}

export {defineConfig, listExperiments, getExperiment, ExperimentConfigSchema, run}
export type {ExperimentConfig, Experiment}
