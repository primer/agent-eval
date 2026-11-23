import {Cause, Data, Effect, Exit, Option, Semaphore} from 'effect'
import type {CopilotRunner} from './copilot-runner'
import {DefaultHost, type Host} from './host'
import {debug, info, error as logError} from './logger'
import type {Sandbox} from './sandbox'
import type {Trial} from './trial/trial'
import type {RunTrialResult} from './trial/run'
import {runTrial} from './trial/run'
import {createTrialStore} from './trial/store'
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
  copilotConcurrency: number
  containerConcurrency: number
  copilotToken: string
  host?: Host
  outputDirectory: string
  plan: Plan<T>
  resume?: boolean
}

type RunPlanResult<T extends Trial> = {
  results: Array<{trial: T; result: RunTrialResult}>
}

type PlanTrialFailure = {
  readonly trialId: string
  readonly cause: unknown
}

class PlanRunError extends Data.TaggedError('PlanRunError')<{
  readonly failures: ReadonlyArray<PlanTrialFailure>
}> {
  override get message(): string {
    const trialIds = this.failures.map(failure => failure.trialId).join(', ')
    const [first] = this.failures
    return `${this.failures.length} trial(s) failed: ${trialIds}. First failure: ${getErrorMessage(first?.cause)}. Completed trials were saved in the output directory.`
  }
}

class TrialEnvironmentError extends Data.TaggedError('TrialEnvironmentError')<{
  readonly trialId: string
  readonly operation: 'build the scenario image' | 'create the sandbox'
  readonly cause: unknown
}> {
  override get message(): string {
    return `Trial ${this.trialId} failed to ${this.operation}: ${getErrorMessage(this.cause)}`
  }
}

const TRIAL_RETRIES = 3

async function runPlan<T extends Trial>({
  copilotConcurrency,
  containerConcurrency,
  copilotToken,
  host = DefaultHost,
  outputDirectory,
  plan,
  resume = false,
}: RunPlanOptions<T>): Promise<RunPlanResult<T>> {
  debug(
    'Running plan with %s trials: %o',
    plan.trials.length,
    plan.trials.map(trial => trial.id),
  )

  const store = createTrialStore({host, outputDirectory})

  const program = Effect.gen(function* () {
    const copilotSemaphore = yield* Semaphore.make(copilotConcurrency)
    const containerSemaphore = yield* Semaphore.make(containerConcurrency)

    const runAttempt = (trial: T) => {
      return Effect.scoped(
        Effect.gen(function* () {
          const location = yield* store.stage(trial)
          const dockerImage = yield* Effect.tryPromise({
            try: () => buildScenarioImage({host, scenario: trial.scenario}),
            catch: cause =>
              new TrialEnvironmentError({trialId: trial.id, operation: 'build the scenario image', cause}),
          })
          const sandbox = yield* Effect.acquireRelease(
            Effect.tryPromise({
              try: () => host.createSandbox({dockerImage}),
              catch: cause => new TrialEnvironmentError({trialId: trial.id, operation: 'create the sandbox', cause}),
            }),
            sandbox => disposeSandbox(trial, sandbox),
          )
          const result = yield* runTrial({
            artifacts: location,
            copilotSemaphore,
            copilotToken,
            host,
            sandbox,
            trial,
          })
          yield* store.commit(location, trial, result)
          return result
        }),
      ).pipe(Semaphore.withPermits(containerSemaphore, 1))
    }

    const runPlanTrial = (trial: T) => {
      return Effect.gen(function* () {
        if (resume) {
          const saved = yield* store.load(trial)
          if (Option.isSome(saved)) {
            info('[%s] Reusing saved trial', trial.id)
            return saved.value
          }
        }

        let attempt = 0
        return yield* runAttempt(trial).pipe(
          Effect.tapError(error => {
            return Effect.sync(() => {
              attempt++
              if (attempt <= TRIAL_RETRIES) {
                logError({err: error}, '[%s] Attempt %d failed, retrying', trial.id, attempt)
              } else {
                logError({err: error}, '[%s] Attempt %d failed, no retries remaining', trial.id, attempt)
              }
            })
          }),
          Effect.retry({times: TRIAL_RETRIES}),
        )
      })
    }

    const exits = yield* Effect.all(
      plan.trials.map(trial => {
        return Effect.exit(runPlanTrial(trial))
      }),
      {concurrency: 'unbounded'},
    )

    const results: RunPlanResult<T>['results'] = []
    const failures: Array<PlanTrialFailure> = []
    for (const [index, exit] of exits.entries()) {
      const trial = plan.trials[index]
      if (Exit.isSuccess(exit)) {
        results.push({trial, result: exit.value})
      } else {
        failures.push({trialId: trial.id, cause: Cause.squash(exit.cause)})
      }
    }

    if (failures.length > 0) {
      return yield* new PlanRunError({failures})
    }

    return {results}
  })

  return await Effect.runPromise(program)
}

function disposeSandbox(trial: Trial, sandbox: Sandbox): Effect.Effect<void> {
  return Effect.tryPromise(() => sandbox[Symbol.asyncDispose]()).pipe(
    Effect.catch(error => {
      return Effect.sync(() => {
        logError({err: error.cause}, '[%s] Failed to dispose sandbox', trial.id)
      })
    }),
  )
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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

export {createPlan, createPlanFromManifest, selectPlanTrials, runPlan, PlanRunError}
export type {Plan, RunPlanResult}
