import {randomUUID} from 'node:crypto'
import path from 'node:path'
import * as z from 'zod/mini'
import type {EnvironmentConfig} from './environment'
import {
  getModelVariants,
  ModelVariantConfigSchema,
  ModelVariantSchema,
  type ModelVariant,
  type ModelVariantConfig,
} from './model'
import {DefaultHost, type Host} from './host'
import {logger} from './logger'
import {create as createPlan, run as runPlan} from './plan'
import {getScenario, loadScenario, ScenarioSchema, type Scenario} from './scenario'
import {selectShard, type Shard} from './shard'
import {ControlTreatment, TreatmentSchema, TreatmentSetupSchema, type Treatment, type TreatmentSetup} from './treatment'
import {
  getPortableTrialPaths,
  readTrialFiles,
  TrialAgentSchema,
  TrialArtifactsSchema,
  WalkthroughSchema,
  writeTrialFiles,
  type ResultFileOptions,
  type Trial,
  type TrialResult,
} from './trial'
import {TestResultsSchema} from './vitest'

type InlineScenarioConfig = {
  name?: string
  path: string
}

type ExperimentScenarioConfig = string | InlineScenarioConfig

type ExperimentConfig = {
  name: string
  description: string
  models: ModelVariantConfig
  scenarios: Array<ExperimentScenarioConfig>
  setup?: TreatmentSetup
  treatments: Array<Treatment>
}

const InlineScenarioConfigSchema = z.object({
  name: z.optional(z.string()),
  path: z.string(),
})

const ExperimentConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  models: ModelVariantConfigSchema,
  scenarios: z.array(z.union([z.string(), InlineScenarioConfigSchema])),
  setup: z.optional(TreatmentSetupSchema),
  treatments: z.array(TreatmentSchema),
}) satisfies z.ZodMiniType<ExperimentConfig>

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

  const filenames = (await host.fs.readdir(experimentsDirectory)).sort()
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
        if (typeof scenario === 'string') {
          return getScenario(host, scenariosDirectory, scenario)
        }

        const directory = path.resolve(scenario.path)
        return loadScenario(host, directory, scenario.name ?? path.basename(directory))
      }),
    )
    const id = path.basename(filename, path.extname(filename))
    const experiment: Experiment = {
      id,
      filepath,
      name: config.name,
      description: config.description,
      models: getModelVariants(config.models),
      scenarios,
      setup: config.setup,
      treatments: config.treatments,
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
  const experiment = experiments.find(candidate => candidate.id === id)
  if (experiment) {
    return experiment
  }

  throw new Error(`Experiment "${id}" was not found in: ${experimentsDirectory}`)
}

type ExperimentRunResult = Array<TrialResult>

async function run({
  env,
  host = DefaultHost,
  id,
  shard,
}: {
  env: EnvironmentConfig
  host?: Host
  id: string
  shard?: Shard
}): Promise<ExperimentRunResult> {
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
  const plan = await createPlan(shard ? selectShard(trials, shard) : trials)
  const results = await runPlan({
    env,
    host,
    plan,
  })

  return results
}

const ExperimentOutputScenarioSchema = z.pick(ScenarioSchema, {
  id: true,
  directory: true,
  prompt: true,
  description: true,
  tags: true,
  testPath: true,
  browserTestPath: true,
})

const ExperimentOutputTreatmentSchema = z.pick(TreatmentSchema, {
  name: true,
})

const ExperimentOutputTrialSchema = z.object({
  agent: TrialAgentSchema,
  artifacts: TrialArtifactsSchema,
  id: z.string(),
  model: ModelVariantSchema,
  scenarioId: z.string(),
  testResults: TestResultsSchema,
  treatmentId: z.string(),
  walkthrough: WalkthroughSchema,
})

type ExperimentOutput = {
  experimentId: string
  scenarios: Map<string, z.infer<typeof ExperimentOutputScenarioSchema>>
  treatments: Map<string, z.infer<typeof ExperimentOutputTreatmentSchema>>
  trials: Map<string, z.infer<typeof ExperimentOutputTrialSchema>>
}

type ExperimentOutputOptions = {
  baseDirectory?: string
}

const ExperimentOutputFileSchema = z.object({
  experimentId: z.string(),
  scenarios: z.record(z.string(), ExperimentOutputScenarioSchema),
  treatments: z.record(z.string(), ExperimentOutputTreatmentSchema),
  trials: z.record(z.string(), z.string()),
})

function output(
  experimentId: string,
  trialResults: ExperimentRunResult,
  options: ExperimentOutputOptions = {},
): ExperimentOutput {
  const result: ExperimentOutput = {
    experimentId,
    scenarios: new Map(),
    treatments: new Map(),
    trials: new Map(),
  }

  for (const trialResult of trialResults) {
    const {trial} = trialResult
    const {artifacts, walkthrough} = options.baseDirectory
      ? getPortableTrialPaths(trialResult, options.baseDirectory)
      : trialResult

    if (!result.scenarios.has(trial.scenario.id)) {
      result.scenarios.set(trial.scenario.id, trial.scenario)
    }

    if (!result.treatments.has(trial.treatment.name)) {
      result.treatments.set(trial.treatment.name, trial.treatment)
    }

    result.trials.set(trial.id, {
      agent: trialResult.agent,
      artifacts,
      id: trial.id,
      model: trial.model,
      scenarioId: trial.scenario.id,
      testResults: trialResult.testResults,
      treatmentId: trial.treatment.name,
      walkthrough,
    })
  }

  return result
}

async function write(
  filepath: string,
  experimentOutput: ExperimentOutput,
  options: ResultFileOptions = {},
): Promise<void> {
  const host = options.host ?? DefaultHost
  const trials = await writeTrialFiles(filepath, experimentOutput.trials, options)
  await host.fs.writeFile(
    filepath,
    JSON.stringify({
      experimentId: experimentOutput.experimentId,
      scenarios: Object.fromEntries(experimentOutput.scenarios),
      treatments: Object.fromEntries(experimentOutput.treatments),
      trials,
    }),
    'utf-8',
  )
}

async function read(filepath: string, options: ResultFileOptions = {}): Promise<ExperimentOutput> {
  const host = options.host ?? DefaultHost
  const contents = await host.fs.readFile(filepath, 'utf-8')
  const result = ExperimentOutputFileSchema.parse(JSON.parse(contents), {reportInput: true})

  return {
    experimentId: result.experimentId,
    scenarios: new Map(Object.entries(result.scenarios)),
    treatments: new Map(Object.entries(result.treatments)),
    trials: await readTrialFiles(
      filepath,
      result.trials,
      input => {
        return ExperimentOutputTrialSchema.parse(input, {reportInput: true})
      },
      options,
    ),
  }
}

export {ExperimentConfigSchema, defineConfig, getExperiment, listExperiments, output, read, run, write}
export type {
  ExperimentConfig,
  Experiment,
  ExperimentOutput,
  ExperimentOutputOptions,
  ExperimentScenarioConfig,
  InlineScenarioConfig,
  ResultFileOptions,
}
