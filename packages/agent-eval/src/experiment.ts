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
import {
  create as createDurablePlan,
  run as runPlan,
  type ExperimentPlan,
  type ExperimentPlanTrialReference,
  type RuntimePlan,
} from './plan'
import {getScenario, loadScenario, ScenarioSchema, type Scenario} from './scenario'
import {selectShard, type Shard} from './shard'
import {ControlTreatment, TreatmentSchema, TreatmentSetupSchema, type Treatment, type TreatmentSetup} from './treatment'
import {RubricResultSchema} from './rubric'
import {
  getPortableTrialPaths,
  readTrialFiles,
  TrialAgentSchema,
  TrialArtifactsSchema,
  WalkthroughSchema,
  writeTrialFiles,
  type ResultFileOptions,
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

function createPlan(experiment: Experiment): ExperimentPlan {
  const treatmentIds = new Set<string>([ControlTreatment.name])

  for (const treatment of experiment.treatments) {
    if (treatmentIds.has(treatment.name)) {
      throw new Error(`Experiment "${experiment.id}" contains duplicate treatment id: ${treatment.name}`)
    }

    treatmentIds.add(treatment.name)
  }

  const trials: Array<ExperimentPlanTrialReference> = experiment.models.flatMap(model => {
    return experiment.scenarios.flatMap(scenario => {
      return [ControlTreatment, ...experiment.treatments].map(treatment => {
        return {
          id: randomUUID(),
          scenarioId: scenario.id,
          treatmentId: treatment.name,
          model,
        }
      })
    })
  })

  return createDurablePlan({
    source: {
      kind: 'experiment',
      id: experiment.id,
    },
    trials,
  })
}

function resolvePlan(experiment: Experiment, plan: ExperimentPlan): RuntimePlan {
  if (plan.source.kind !== 'experiment') {
    throw new Error(`Expected an experiment plan, received: ${plan.source.kind}`)
  }

  if (plan.source.id !== experiment.id) {
    throw new Error(`Plan references experiment "${plan.source.id}", but loaded experiment "${experiment.id}"`)
  }

  const treatments = new Map<string, Treatment>([[ControlTreatment.name, ControlTreatment]])
  for (const treatment of experiment.treatments) {
    if (treatments.has(treatment.name)) {
      throw new Error(`Experiment "${experiment.id}" contains duplicate treatment id: ${treatment.name}`)
    }

    treatments.set(treatment.name, treatment)
  }

  return {
    trials: plan.trials.map(reference => {
      const scenario = experiment.scenarios.find(candidate => candidate.id === reference.scenarioId)
      if (!scenario) {
        throw new Error(`Plan trial "${reference.id}" references missing scenario: ${reference.scenarioId}`)
      }

      const treatment = treatments.get(reference.treatmentId)
      if (!treatment) {
        throw new Error(`Plan trial "${reference.id}" references missing treatment: ${reference.treatmentId}`)
      }

      const model = experiment.models.find(candidate => {
        return candidate.name === reference.model.name && candidate.reasoningEffort === reference.model.reasoningEffort
      })
      if (!model) {
        throw new Error(
          `Plan trial "${reference.id}" references missing model variant: ${reference.model.name}/${reference.model.reasoningEffort}`,
        )
      }

      return {
        id: reference.id,
        scenario,
        treatment,
        model,
        setup: experiment.setup,
      }
    }),
  }
}

async function run({
  env,
  host = DefaultHost,
  id,
  plan,
  shard,
}: {
  env: EnvironmentConfig
  host?: Host
  id?: string
  plan?: ExperimentPlan
  shard?: Shard
}): Promise<ExperimentRunResult> {
  if (id && plan) {
    throw new Error('Experiment run accepts either an id or a plan, not both')
  }

  if (!id && !plan) {
    throw new Error('Experiment run requires an id or a plan')
  }

  const experimentId = plan?.source.id ?? id
  if (!experimentId) {
    throw new Error('Experiment run requires an id or a plan')
  }

  const experiment = await getExperiment({
    host,
    experimentsDirectory: env.experimentsDirectory,
    scenariosDirectory: env.scenariosDirectory,
    id: experimentId,
  })
  const durablePlan = plan ?? createPlan(experiment)
  const selectedPlan = shard
    ? {
        ...durablePlan,
        trials: selectShard(durablePlan.trials, shard),
      }
    : durablePlan
  const results = await runPlan({
    env,
    host,
    plan: resolvePlan(experiment, selectedPlan),
  })

  return results
}

const ExperimentOutputScenarioSchema = z.pick(ScenarioSchema, {
  id: true,
  directory: true,
  prompt: true,
  description: true,
  rubric: true,
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
  rubricResult: z.optional(RubricResultSchema),
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

type ExperimentOutputFile = z.infer<typeof ExperimentOutputFileSchema>

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

    const outputTrial: z.infer<typeof ExperimentOutputTrialSchema> = {
      agent: trialResult.agent,
      artifacts,
      id: trial.id,
      model: trial.model,
      scenarioId: trial.scenario.id,
      testResults: trialResult.testResults,
      treatmentId: trial.treatment.name,
      walkthrough,
    }
    if (trialResult.rubricResult) {
      outputTrial.rubricResult = trialResult.rubricResult
    }
    result.trials.set(trial.id, outputTrial)
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

function parseOutputFile(input: unknown): ExperimentOutputFile {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input
  return ExperimentOutputFileSchema.parse(parsed, {reportInput: true})
}

function merge(outputs: Array<ExperimentOutput>): ExperimentOutput {
  const [first, ...remaining] = outputs
  if (!first) {
    throw new Error('At least one experiment output is required to merge shards')
  }

  const result: ExperimentOutput = {
    experimentId: first.experimentId,
    scenarios: new Map(first.scenarios),
    treatments: new Map(first.treatments),
    trials: new Map(first.trials),
  }

  for (const shardOutput of remaining) {
    if (shardOutput.experimentId !== result.experimentId) {
      throw new Error(
        `Cannot merge experiment outputs for different sources: "${result.experimentId}" and "${shardOutput.experimentId}"`,
      )
    }

    mergeMetadataMap(result.scenarios, shardOutput.scenarios, 'scenario')
    mergeMetadataMap(result.treatments, shardOutput.treatments, 'treatment')

    for (const [trialId, trial] of shardOutput.trials) {
      if (result.trials.has(trialId)) {
        throw new Error(`Cannot merge duplicate trial id: ${trialId}`)
      }

      result.trials.set(trialId, trial)
    }
  }

  return result
}

function mergeMetadataMap<T>(target: Map<string, T>, source: Map<string, T>, type: string): void {
  for (const [id, value] of source) {
    const existing = target.get(id)
    if (target.has(id) && JSON.stringify(existing) !== JSON.stringify(value)) {
      throw new Error(`Cannot merge conflicting ${type} metadata for id: ${id}`)
    }

    target.set(id, value)
  }
}

export {
  ExperimentConfigSchema,
  createPlan,
  defineConfig,
  getExperiment,
  listExperiments,
  merge,
  output,
  parseOutputFile,
  read,
  resolvePlan,
  run,
  write,
}
export type {
  ExperimentConfig,
  Experiment,
  ExperimentOutput,
  ExperimentOutputFile,
  ExperimentOutputOptions,
  ExperimentScenarioConfig,
  InlineScenarioConfig,
  ResultFileOptions,
}
