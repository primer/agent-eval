import Queue from 'p-queue'
import {run as runTrial} from './trial'
import type {Trial, TrialResult} from './trial'
import type {EnvironmentConfig} from './environment'
import {DefaultHost, type Host} from './host'
import {logger} from './logger'

/**
 * A plan is an ordered list of trials to be ran.
 */
type Plan = {
  trials: Array<Trial>
}

// TODO: support plan with sharding
async function create(trials: Array<Trial>): Promise<Plan> {
  return {
    trials: randomize(trials),
  }
}

function randomize<T>(input: Array<T>): Array<T> {
  const randomized: Array<T> = input.slice()

  // Fisher–Yates shuffle
  for (let i = randomized.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[randomized[i], randomized[j]] = [randomized[j], randomized[i]]
  }

  return randomized
}

type RunPlanOptions = {
  env: EnvironmentConfig
  host?: Host
  plan: Plan
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

export {create, run}
export type {Plan}
