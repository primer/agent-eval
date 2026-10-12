import Queue from 'p-queue'
import path from 'node:path'
import {isDeepStrictEqual} from 'node:util'
import * as z from 'zod/mini'
import {CopilotRunnerSchema} from './copilot-runner'
import type {CopilotRunner} from './copilot-runner'
import {DefaultHost, type Host} from './host'
import {logger} from './logger'
import type {Trial} from './trial/trial'
import type {RunTrialResult} from './trial/run'
import {getTrialArtifacts, runTrial, RunTrialResultSchema} from './trial/run'
import {ModelVariantSchema} from './model'
import {buildScenarioImage} from './scenario/scenario'
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
}

/**
 * Creates a plan from a collection of trials that have come from a manifest.
 * It is assumed that these have already been randomized when saved to the
 * manifest.
 */
function createPlanFromManifest<T extends Trial>({trials}: CreatePlanFromManifestOptions<T>): Plan<T> {
  return {
    trials,
  }
}

type SelectPlanTrialsOptions<T> = {
  trials: Array<T>
  runner?: CopilotRunner
  shard?: Shard
}

function selectPlanTrials<T extends Pick<Trial, 'runner'>>({
  trials,
  runner,
  shard,
}: SelectPlanTrialsOptions<T>): Array<T> {
  if (
    runner &&
    !trials.some(trial => {
      return trial.runner === runner
    })
  ) {
    throw new Error(
      `No trials found for runner "${runner}" in the saved plan. Add "${runner}" to the configuration's runners and create a new plan.`,
    )
  }

  const selected = shard ? selectShard(trials, shard) : trials
  return runner
    ? selected.filter(trial => {
        return trial.runner === runner
      })
    : selected
}

type RunPlanOptions<T extends Trial> = {
  artifactsDirectory: string
  copilotConcurrency: number
  containerConcurrency: number
  copilotToken: string
  host?: Host
  plan: Plan<T>
  resume?: boolean
}

const TrialCheckpointSchema = z.object({
  identity: z.object({
    id: z.string(),
    model: ModelVariantSchema,
    runner: z._default(CopilotRunnerSchema, 'copilot-cli'),
    scenarioId: z.string(),
    treatmentId: z.string(),
    capabilityId: z.optional(z.string()),
  }),
  result: z.omit(RunTrialResultSchema, {trial: true}),
})

function getTrialIdentity(trial: Trial & {capability?: {id: string}}) {
  return {
    id: trial.id,
    model: trial.model,
    runner: trial.runner,
    scenarioId: trial.scenario.id,
    treatmentId: trial.treatment.id,
    ...(trial.capability ? {capabilityId: trial.capability.id} : {}),
  }
}

type RunPlanResult<T extends Trial> = {
  results: Array<{trial: T; result: RunTrialResult}>
}

async function runPlan<T extends Trial>({
  artifactsDirectory,
  copilotConcurrency,
  containerConcurrency,
  copilotToken,
  host = DefaultHost,
  plan,
  resume = false,
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

  const saved = new Map<string, RunTrialResult>()
  const trials = plan.trials.map(trial => {
    return {
      trial,
      artifacts: getTrialArtifacts(artifactsDirectory, trial.id),
      checkpointPath: path.join(artifactsDirectory, '.checkpoints', `${trial.id}.json`),
    }
  })
  if (resume) {
    for (const {trial, artifacts, checkpointPath} of trials) {
      if (!host.fs.existsSync(checkpointPath)) {
        continue
      }
      const checkpoint = TrialCheckpointSchema.parse(
        JSON.parse(await host.fs.promises.readFile(checkpointPath, 'utf-8')),
      )
      if (!isDeepStrictEqual(checkpoint.identity, getTrialIdentity(trial))) {
        throw new Error(`Saved result does not match trial: ${trial.id}`)
      }
      if (!checkpoint.result.error) {
        saved.set(trial.id, {
          ...checkpoint.result,
          artifacts,
          trial,
        })
      }
    }
  }

  const results = await Promise.all(
    trials.map(async ({trial, artifacts, checkpointPath}) => {
      const previous = saved.get(trial.id)
      if (previous) {
        logger.info('Reusing completed trial: %s', trial.id)
        return {trial, result: previous}
      }

      await host.fs.promises.rm(checkpointPath, {force: true})

      let result: RunTrialResult
      try {
        result = await retry(() => {
          return containerQueue.add(async () => {
            const dockerImage = await buildScenarioImage({
              host,
              scenario: trial.scenario,
            })
            await using sandbox = await host.createSandbox({
              dockerImage,
            })
            return await runTrial({
              artifactsDirectory,
              copilotQueue,
              copilotToken,
              host,
              sandbox,
              trial,
            })
          })
        })
      } catch (error) {
        logger.error({err: error, trialId: trial.id}, 'Trial failed')
        result = {
          trial,
          error: {
            name: redact(error instanceof Error ? error.name : 'Error', copilotToken),
            message: redact(error instanceof Error ? error.message : String(error), copilotToken),
          },
          agent: {sessions: []},
          artifacts,
          checks: [],
          judges: [],
          walkthrough: {type: 'Unavailable'},
        }
      }

      await host.fs.promises.mkdir(path.dirname(checkpointPath), {recursive: true})
      const data = TrialCheckpointSchema.shape.result.parse(result)
      await host.fs.promises.writeFile(
        `${checkpointPath}.tmp`,
        JSON.stringify({identity: getTrialIdentity(trial), result: data}, null, 2),
        'utf-8',
      )
      await host.fs.promises.rename(`${checkpointPath}.tmp`, checkpointPath)
      return {trial, result}
    }),
  )

  return {
    results,
  }
}

function redact(value: string, token: string): string {
  return token ? value.replaceAll(token, '[REDACTED]') : value
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

async function retry<T>(fn: () => Promise<T>, retries: number = 3): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (retries > 0) {
      logger.error({err: error}, 'Retrying')
      return retry(fn, retries - 1)
    }
    throw error
  }
}

export {createPlan, createPlanFromManifest, selectPlanTrials, runPlan}
export type {Plan, RunPlanResult}
