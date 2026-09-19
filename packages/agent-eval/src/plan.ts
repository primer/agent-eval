import Queue from 'p-queue'
import path from 'node:path'
import type {CopilotRunner} from './copilot-runner'
import {DefaultHost, type Host} from './host'
import {logger} from './logger'
import type {Trial} from './trial/trial'
import type {RunTrialResult} from './trial/run'
import {runTrial} from './trial/run'
import {selectShard, type Shard} from './shard'
import {buildScenarioImage} from './scenario/scenario'
import {SandboxCleanupQueue} from './cleanup'

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
  host?: Host
  plan: Plan<T>
}

type RunPlanResult<T extends Trial> = {
  results: Array<{trial: T; result: RunTrialResult}>
  errors?: Array<Error>
}

async function runPlan<T extends Trial>({
  artifactsDirectory,
  copilotConcurrency,
  containerConcurrency,
  copilotToken,
  host = DefaultHost,
  plan,
}: RunPlanOptions<T>): Promise<RunPlanResult<T>> {
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
  const cleanupQueue = new SandboxCleanupQueue(containerConcurrency)

  const errors: Array<Error> = []
  const settled = await Promise.allSettled(
    plan.trials.map(trial => {
      return containerQueue.add(async () => {
        for (let attempt = 0; attempt < 4; attempt++) {
          const dockerImage = await buildScenarioImage({
            host,
            scenario: trial.scenario,
          })
          const sandbox = await cleanupQueue.create(() => {
            return host.createSandbox({dockerImage})
          })
          let outcome: {type: 'completed'; result: RunTrialResult} | {type: 'failed'; error: unknown}
          let cleanup: Promise<boolean>
          try {
            try {
              const result = await runTrial({
                artifactsDirectory,
                copilotQueue,
                copilotToken,
                host,
                sandbox,
                trial,
              })
              outcome = {type: 'completed', result}
            } catch (error) {
              outcome = {type: 'failed', error}
            }

            if (outcome.type === 'completed') {
              const directory = outcome.result.artifacts.directory
              await host.fs.mkdir(directory, {recursive: true})
              await host.fs.writeFile(
                path.join(directory, 'trial-result.json'),
                JSON.stringify(outcome.result, null, 2),
                'utf-8',
              )
            }
          } finally {
            cleanup = cleanupQueue.dispose(sandbox, trial.id)
          }

          if (outcome.type === 'completed') {
            return {trial, result: outcome.result}
          }
          const removed = await cleanup
          if (!removed || attempt === 3) {
            throw new Error(`Trial "${trial.id}" failed`, {cause: outcome.error})
          }
          logger.error({err: outcome.error, trialId: trial.id}, 'Retrying trial')
        }
        throw new Error(`Trial "${trial.id}" exhausted its attempts`)
      })
    }),
  )
  await cleanupQueue.drain()
  errors.push(...cleanupQueue.errors)

  const results: RunPlanResult<T>['results'] = []
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      results.push(result.value)
    } else {
      const error = new Error('Trial execution failed', {cause: result.reason})
      errors.push(error)
      logger.error({err: error}, 'Trial execution failed')
    }
  }

  return {
    results,
    errors,
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

function assertPlanSucceeded(result: Pick<RunPlanResult<Trial>, 'errors'>): void {
  if (result.errors?.length) {
    throw new AggregateError(
      result.errors,
      'Evaluation encountered infrastructure errors; completed results were saved',
    )
  }
}

export {assertPlanSucceeded, createPlan, createPlanFromManifest, runPlan}
export type {Plan, RunPlanResult}
