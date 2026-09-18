import Queue from 'p-queue'
import type {CopilotRunner} from './copilot-runner'
import {DefaultHost, type Host} from './host'
import {logger} from './logger'
import type {Trial} from './trial/trial'
import {runTrial, type RunTrialResult, type TrialExecutionOptions} from './trial/run'
import {selectShard, type Shard} from './shard'

/**
 * A Plan represents an ordered collection of trials to run. Plans are created
 * through `createPlan` which ensures randomized order or through `createPlanFromManifest`
 * which assumes the trials have already been randomized.
 */
type Plan<T extends Trial = Trial> = {
  trials: Array<T>
}

type CreatePlanOptions<T extends Trial> = {
  trials: Array<T>
}

/**
 * Creates a plan from a collection of trials. We use this to build a plan so
 * th at the trials are randomized before running.
 */
function createPlan<T extends Trial>({trials}: CreatePlanOptions<T>): Plan<T> {
  return {
    trials: randomize(trials),
  }
}

type CreatePlanFromManifestOptions<T extends Trial> = {
  trials: Array<T>
  shard?: Shard
  runner?: CopilotRunner
}

/**
 * Creates a plan from a collection of trials that have come from a manifest.
 * It is assumed that these have already been randomized when saved to the
 * manifest.
 *
 * When the `shard` option is provided, the plan will be filtered to only include trials
 * that match the shard's order and total.
 */
function createPlanFromManifest<T extends Trial>({runner, shard, trials}: CreatePlanFromManifestOptions<T>): Plan<T> {
  if (
    runner &&
    !trials.some(trial => {
      return (trial.runner ?? 'copilot-cli') === runner
    })
  ) {
    throw new Error(
      `No trials found for runner "${runner}" in the saved plan. Create a new plan with --runner ${runner}.`,
    )
  }

  const selected = shard ? selectShard(trials, shard) : trials
  return {
    trials: runner
      ? selected.filter(trial => {
          return (trial.runner ?? 'copilot-cli') === runner
        })
      : selected,
  }
}

type RunPlanOptions<T extends Trial> = {
  artifactsDirectory: string
  copilotConcurrency: number
  containerConcurrency: number
  copilotToken: string
  dockerImage?: string
  execution?: TrialExecutionOptions
  host?: Host
  maxRetries?: number
  plan: Plan<T>
  preparedImage?: string
}

type RunPlanResult<T extends Trial> = {
  results: Array<{trial: T; result: RunTrialResult}>
}

async function runPlan<T extends Trial>({
  artifactsDirectory,
  copilotConcurrency,
  containerConcurrency,
  copilotToken,
  dockerImage,
  execution,
  host = DefaultHost,
  maxRetries = 3,
  plan,
  preparedImage,
}: RunPlanOptions<T>): Promise<RunPlanResult<T>> {
  if (!Number.isSafeInteger(maxRetries) || maxRetries < 0) {
    throw new Error('maxRetries must be a non-negative safe integer')
  }
  if (preparedImage && dockerImage) {
    throw new Error('preparedImage cannot be combined with dockerImage')
  }
  logger.debug(
    'Running plan with %s trials: %o',
    plan.trials.length,
    plan.trials.map(trial => trial.id),
  )

  const copilotQueue = new Queue({
    concurrency: copilotConcurrency,
  })
  const containerQueue = new Queue({
    concurrency: containerConcurrency,
  })

  const results = await Promise.all(
    plan.trials.map(trial => {
      return retry(attempt => {
        return containerQueue.add(async () => {
          await using sandbox = await host.createSandbox({
            ...(preparedImage ? {preparedImage} : {dockerImage}),
          })
          const result = await runTrial({
            artifactsDirectory,
            copilotQueue,
            copilotToken,
            host,
            sandbox,
            trial,
            execution,
            attempt: {
              maxRetries,
              number: attempt,
            },
          })
          return {
            trial,
            result,
          }
        })
      }, maxRetries)
    }),
  )

  return {
    results,
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

async function retry<T>(fn: (attempt: number) => Promise<T>, retries: number = 3): Promise<T> {
  let attempt = 1

  while (true) {
    try {
      return await fn(attempt)
    } catch (error) {
      if (attempt > retries) {
        throw error
      }

      logger.error({error}, 'Retrying')
      attempt += 1
    }
  }
}

export {createPlan, createPlanFromManifest, runPlan}
export type {Plan, RunPlanResult}
