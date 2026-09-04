import Queue from 'p-queue'
import * as z from 'zod/mini'
import type {EnvironmentConfig} from './environment'
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

function create(input: Omit<BenchmarkPlan, 'version'>): BenchmarkPlan
function create(input: Omit<ExperimentPlan, 'version'>): ExperimentPlan
function create(input: CreatePlanInput): Plan {
  const plan =
    input.source.kind === 'benchmark'
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
  assertUniqueTrialIds(plan)
  return plan
}

function serialize(plan: Plan): string {
  const parsed = PlanSchema.parse(plan)
  assertUniqueTrialIds(parsed)
  return `${JSON.stringify(parsed, null, 2)}\n`
}

function deserialize(input: unknown): Plan {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input
  const plan = PlanSchema.parse(parsed, {reportInput: true})
  assertUniqueTrialIds(plan)
  return plan
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

function assertUniqueTrialIds(plan: Plan): void {
  const ids = new Set<string>()

  for (const trial of plan.trials) {
    if (ids.has(trial.id)) {
      throw new Error(`Plan contains duplicate trial id: ${trial.id}`)
    }

    ids.add(trial.id)
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
  Plan,
  PlanTrialReference,
  RuntimePlan,
}
