import path from 'node:path'
import Queue from 'p-queue'
import * as z from 'zod/mini'
import type {BenchmarkOutputFile} from './benchmark'
import type {EnvironmentConfig} from './environment'
import type {ExperimentOutputFile} from './experiment'
import {DefaultHost, type Host} from './host'
import {logger} from './logger'
import {ModelVariantSchema} from './model'
import {selectShard, type Shard} from './shard'
import {run as runTrial} from './trial'
import type {Trial, TrialResult} from './trial'

const PLAN_VERSION = 1

const BenchmarkPlanTrialReferenceSchema = z.object({
  id: z.string(),
  scenarioId: z.string(),
  treatmentId: z.string(),
  model: ModelVariantSchema,
  capabilityId: z.string(),
})

const ExperimentPlanTrialReferenceSchema = z.object({
  id: z.string(),
  scenarioId: z.string(),
  treatmentId: z.string(),
  model: ModelVariantSchema,
})

const BenchmarkPlanSchema = z.object({
  version: z.literal(PLAN_VERSION),
  source: z.object({
    kind: z.literal('benchmark'),
    id: z.string(),
  }),
  trials: z.array(BenchmarkPlanTrialReferenceSchema),
})

const ExperimentPlanSchema = z.object({
  version: z.literal(PLAN_VERSION),
  source: z.object({
    kind: z.literal('experiment'),
    id: z.string(),
  }),
  trials: z.array(ExperimentPlanTrialReferenceSchema),
})

const PlanSchema = z.union([BenchmarkPlanSchema, ExperimentPlanSchema])

type BenchmarkPlanTrialReference = z.infer<typeof BenchmarkPlanTrialReferenceSchema>
type ExperimentPlanTrialReference = z.infer<typeof ExperimentPlanTrialReferenceSchema>
type BenchmarkPlan = z.infer<typeof BenchmarkPlanSchema>
type ExperimentPlan = z.infer<typeof ExperimentPlanSchema>

type Plan = BenchmarkPlan | ExperimentPlan
type PlanTrialReference = BenchmarkPlanTrialReference | ExperimentPlanTrialReference
type CreatePlanInput = Omit<BenchmarkPlan, 'version'> | Omit<ExperimentPlan, 'version'>

type RuntimePlan = {
  trials: Array<Trial>
}

type MergedResults =
  | {
      kind: 'benchmark'
      output: BenchmarkOutputFile
    }
  | {
      kind: 'experiment'
      output: ExperimentOutputFile
    }

type MergeResultsOptions = {
  host?: Host
  targetDirectory?: string
}

function create(input: Omit<BenchmarkPlan, 'version'>): BenchmarkPlan
function create(input: Omit<ExperimentPlan, 'version'>): ExperimentPlan
function create(input: CreatePlanInput): Plan {
  return input.source.kind === 'benchmark'
    ? BenchmarkPlanSchema.parse({
        version: PLAN_VERSION,
        source: input.source,
        trials: randomize(input.trials),
      })
    : ExperimentPlanSchema.parse({
        version: PLAN_VERSION,
        source: input.source,
        trials: randomize(input.trials),
      })
}

function serialize(plan: Plan): string {
  const parsed = PlanSchema.parse(plan)
  return `${JSON.stringify(parsed, null, 2)}\n`
}

function deserialize(input: unknown): Plan {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input
  return PlanSchema.parse(parsed, {reportInput: true})
}

function select(plan: BenchmarkPlan, shard: Shard): BenchmarkPlan
function select(plan: ExperimentPlan, shard: Shard): ExperimentPlan
function select(plan: Plan, shard: Shard): Plan {
  if (isBenchmarkPlan(plan)) {
    return {
      ...plan,
      trials: selectShard(plan.trials, shard),
    }
  }

  return {
    ...plan,
    trials: selectShard(plan.trials, shard),
  }
}

function isBenchmarkPlan(plan: Plan): plan is BenchmarkPlan {
  return plan.source.kind === 'benchmark'
}

async function mergeResults(filepaths: Array<string>, options: MergeResultsOptions = {}): Promise<MergedResults> {
  if (filepaths.length === 0) {
    throw new Error('No shard outputs were found to merge')
  }

  const targetDirectory = path.resolve(options.targetDirectory ?? path.dirname(filepaths[0]))
  for (const filepath of filepaths) {
    if (path.resolve(path.dirname(filepath)) !== targetDirectory) {
      throw new Error('Shard outputs and the merged output must use the same directory')
    }
  }

  const host = options.host ?? DefaultHost
  const manifests = await Promise.all(
    filepaths.map(async filepath => {
      return JSON.parse(await host.fs.readFile(filepath, 'utf-8')) as unknown
    }),
  )
  const kinds = manifests.map(getOutputKind)
  const firstKind = kinds[0]
  if (
    kinds.some(kind => {
      return kind !== firstKind
    })
  ) {
    throw new Error('Cannot merge benchmark and experiment shard outputs together')
  }

  if (firstKind === 'benchmark') {
    const {parseOutputFile} = await import('./benchmark')
    return {
      kind: 'benchmark',
      output: mergeBenchmarkOutputFiles(manifests.map(parseOutputFile)),
    }
  }

  const {parseOutputFile} = await import('./experiment')
  return {
    kind: 'experiment',
    output: mergeExperimentOutputFiles(manifests.map(parseOutputFile)),
  }
}

function getOutputKind(input: unknown): 'benchmark' | 'experiment' {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Shard output must be a JSON object')
  }

  const hasBenchmarkId = 'benchmarkId' in input
  const hasExperimentId = 'experimentId' in input
  if (hasBenchmarkId === hasExperimentId) {
    throw new Error('Shard output must contain exactly one of benchmarkId or experimentId')
  }

  return hasBenchmarkId ? 'benchmark' : 'experiment'
}

function mergeBenchmarkOutputFiles(outputs: Array<BenchmarkOutputFile>): BenchmarkOutputFile {
  const [first, ...remaining] = outputs
  if (!first) {
    throw new Error('At least one benchmark output is required to merge shards')
  }

  const result = structuredClone(first)
  for (const output of remaining) {
    if (output.benchmarkId !== result.benchmarkId) {
      throw new Error(
        `Cannot merge benchmark outputs for different sources: "${result.benchmarkId}" and "${output.benchmarkId}"`,
      )
    }

    mergeMetadataRecord(result.capabilities, output.capabilities, 'capability')
    mergeMetadataRecord(result.scenarios, output.scenarios, 'scenario')
    mergeMetadataRecord(result.treatments, output.treatments, 'treatment')
    mergeTrialReferences(result.trials, output.trials)
  }

  return result
}

function mergeExperimentOutputFiles(outputs: Array<ExperimentOutputFile>): ExperimentOutputFile {
  const [first, ...remaining] = outputs
  if (!first) {
    throw new Error('At least one experiment output is required to merge shards')
  }

  const result = structuredClone(first)
  for (const output of remaining) {
    if (output.experimentId !== result.experimentId) {
      throw new Error(
        `Cannot merge experiment outputs for different sources: "${result.experimentId}" and "${output.experimentId}"`,
      )
    }

    mergeMetadataRecord(result.scenarios, output.scenarios, 'scenario')
    mergeMetadataRecord(result.treatments, output.treatments, 'treatment')
    mergeTrialReferences(result.trials, output.trials)
  }

  return result
}

function mergeMetadataRecord<T>(target: Record<string, T>, source: Record<string, T>, type: string): void {
  for (const [id, value] of Object.entries(source)) {
    if (id in target && JSON.stringify(target[id]) !== JSON.stringify(value)) {
      throw new Error(`Cannot merge conflicting ${type} metadata for id: ${id}`)
    }

    target[id] = value
  }
}

function mergeTrialReferences(target: Record<string, string>, source: Record<string, string>): void {
  for (const [trialId, reference] of Object.entries(source)) {
    if (trialId in target) {
      throw new Error(`Cannot merge duplicate trial id: ${trialId}`)
    }

    target[trialId] = reference
  }
}

function randomize<T>(input: Array<T>): Array<T> {
  const randomized: Array<T> = input.slice()

  // Fisher-Yates shuffle
  for (let i = randomized.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[randomized[i], randomized[j]] = [randomized[j], randomized[i]]
  }

  return randomized
}

type RunPlanOptions = {
  env: EnvironmentConfig
  host?: Host
  plan: RuntimePlan
}

async function run({env, host = DefaultHost, plan}: RunPlanOptions): Promise<Array<TrialResult>> {
  const queue = new Queue({
    concurrency: env.concurrency,
  })

  const results = await Promise.all(
    plan.trials.map(trial => {
      return queue.add(() => {
        return retry(async () => {
          await using sandbox = await host.createSandbox({
            dockerImage: env.dockerImage,
          })
          return await runTrial({
            artifactsDirectory: env.artifactsDirectory,
            copilotToken: env.copilotToken,
            host,
            sandbox,
            trial,
          })
        })
      })
    }),
  )

  return results
}

async function retry<T>(fn: () => Promise<T>, retries: number = 3): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (retries > 0) {
      logger.error({error}, 'Retrying')
      return retry(fn, retries - 1)
    }
    throw error
  }
}

export {
  BenchmarkPlanSchema,
  ExperimentPlanSchema,
  PLAN_VERSION,
  PlanSchema,
  create,
  deserialize,
  isBenchmarkPlan,
  mergeResults,
  run,
  select,
  serialize,
}
export type {
  BenchmarkPlan,
  BenchmarkPlanTrialReference,
  CreatePlanInput,
  ExperimentPlan,
  ExperimentPlanTrialReference,
  MergedResults,
  MergeResultsOptions,
  Plan,
  PlanTrialReference,
  RuntimePlan,
}
