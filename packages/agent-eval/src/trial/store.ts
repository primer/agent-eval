import {randomUUID} from 'node:crypto'
import path from 'node:path'
import {Data, Effect, Option, type Scope} from 'effect'
import * as z from 'zod/mini'
import {CopilotRunnerSchema} from '../copilot-runner'
import {DefaultHost, type Host} from '../host'
import {debug, error as logError} from '../logger'
import {ModelVariantSchema} from '../model'
import {
  TrialAgentSchema,
  TrialArtifactsSchema,
  TrialChecksSchema,
  TrialJudgesSchema,
  TrialWalkthroughSchema,
  getTrialArtifacts,
  type RunTrialResult,
  type TrialArtifactLocation,
} from './run'
import type {Trial} from './trial'

const TRIAL_COMMIT_FILENAME = '.agent-eval-trial.json'

const ARTIFACTS_DIRECTORY = 'artifacts'
const STAGING_DIRECTORY = path.join('.agent-eval', 'staging')

class TrialStoreError extends Data.TaggedError('TrialStoreError')<{
  readonly trialId: string
  readonly message: string
  readonly cause?: unknown
}> {}

const TrialIdentitySchema = z.object({
  id: z.string(),
  scenarioId: z.string(),
  treatmentId: z.string(),
  model: ModelVariantSchema,
  runner: CopilotRunnerSchema,
  capabilityId: z.optional(z.string()),
})

type TrialIdentity = z.infer<typeof TrialIdentitySchema>

const TrialCommitSchema = z.object({
  version: z.literal(1),
  committedAt: z.pipe(
    z.iso.datetime(),
    z.transform(value => {
      return new Date(value)
    }),
  ),
  trial: TrialIdentitySchema,
  result: z.object({
    agent: TrialAgentSchema,
    artifacts: TrialArtifactsSchema,
    checks: TrialChecksSchema,
    judges: TrialJudgesSchema,
    walkthrough: TrialWalkthroughSchema,
  }),
})

type TrialCommit = z.output<typeof TrialCommitSchema>

function parseTrialCommit(json: unknown): TrialCommit {
  return TrialCommitSchema.parse(json)
}

const CapabilityTrialSchema = z.object({
  capability: z.object({
    id: z.string(),
  }),
})

function getTrialIdentity(trial: Trial): TrialIdentity {
  const capability = CapabilityTrialSchema.safeParse(trial)

  return {
    id: trial.id,
    scenarioId: trial.scenario.id,
    treatmentId: trial.treatment.id,
    model: trial.model,
    runner: trial.runner,
    ...(capability.success ? {capabilityId: capability.data.capability.id} : {}),
  }
}

function getIdentityMismatches(committed: TrialIdentity, expected: TrialIdentity): Array<string> {
  const fields = [
    ['id', committed.id, expected.id],
    ['scenario', committed.scenarioId, expected.scenarioId],
    ['treatment', committed.treatmentId, expected.treatmentId],
    ['model', committed.model.name, expected.model.name],
    ['reasoning effort', committed.model.reasoningEffort, expected.model.reasoningEffort],
    ['runner', committed.runner, expected.runner],
    ['capability', committed.capabilityId, expected.capabilityId],
  ] as const

  return fields
    .filter(([, actual, wanted]) => {
      return actual !== wanted
    })
    .map(([name, actual, wanted]) => {
      return `${name} (committed: ${actual ?? 'none'}, expected: ${wanted ?? 'none'})`
    })
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

type TrialStore = {
  /**
   * Load a committed trial result. A trial directory without a commit record
   * is an uncommitted leftover and is reported as not committed.
   */
  load(trial: Trial): Effect.Effect<Option.Option<RunTrialResult>, TrialStoreError>
  /**
   * Create an empty, attempt-private staging directory. Closing the scope
   * removes the trial's staging directory, so uncommitted work is discarded.
   */
  stage(trial: Trial): Effect.Effect<TrialArtifactLocation, TrialStoreError, Scope.Scope>
  /**
   * Write the commit record into the staging directory and atomically publish
   * it as the trial directory.
   */
  commit(location: TrialArtifactLocation, trial: Trial, result: RunTrialResult): Effect.Effect<void, TrialStoreError>
}

type CreateTrialStoreOptions = {
  host?: Host
  outputDirectory: string
}

function createTrialStore({host = DefaultHost, outputDirectory}: CreateTrialStoreOptions): TrialStore {
  const fs = host.fs.promises
  const artifactsDirectory = path.join(outputDirectory, ARTIFACTS_DIRECTORY)
  const stagingRoot = path.join(outputDirectory, STAGING_DIRECTORY)

  function getTrialDirectory(trial: Trial) {
    return path.join(artifactsDirectory, trial.id)
  }

  function getTrialStagingDirectory(trial: Trial) {
    return path.join(stagingRoot, trial.id)
  }

  return {
    load(trial) {
      return Effect.gen(function* () {
        const recordPath = path.join(getTrialDirectory(trial), TRIAL_COMMIT_FILENAME)

        const contents = yield* Effect.tryPromise({
          try: async () => {
            try {
              return Option.some(await fs.readFile(recordPath, 'utf-8'))
            } catch (error) {
              if (isNotFoundError(error)) {
                return Option.none<string>()
              }
              throw error
            }
          },
          catch: cause => {
            return new TrialStoreError({
              trialId: trial.id,
              message: `Unable to read trial commit record: ${recordPath}`,
              cause,
            })
          },
        })

        if (Option.isNone(contents)) {
          debug('[%s] No trial commit record found: %s', trial.id, recordPath)
          return Option.none<RunTrialResult>()
        }

        const commit = yield* Effect.try({
          try: () => {
            return parseTrialCommit(JSON.parse(contents.value))
          },
          catch: cause => {
            return new TrialStoreError({
              trialId: trial.id,
              message: `Invalid trial commit record: ${recordPath}. Use a fresh output directory to run this plan.`,
              cause,
            })
          },
        })

        const mismatches = getIdentityMismatches(commit.trial, getTrialIdentity(trial))
        if (mismatches.length > 0) {
          return yield* Effect.fail(
            new TrialStoreError({
              trialId: trial.id,
              message: `Trial commit record ${recordPath} belongs to a different trial: ${mismatches.join(', ')}. Use a fresh output directory to run this plan.`,
            }),
          )
        }

        // Rebase artifact paths so moved or restored output directories resolve
        // to their current location.
        return Option.some<RunTrialResult>({
          ...commit.result,
          artifacts: getTrialArtifacts(getTrialDirectory(trial)),
          trial,
        })
      })
    },

    stage(trial) {
      const trialStagingDirectory = getTrialStagingDirectory(trial)

      return Effect.acquireRelease(
        Effect.tryPromise({
          try: async () => {
            // Only this process runs a given trial ID, so leftovers are from a
            // previous attempt or crashed run.
            await fs.rm(trialStagingDirectory, {recursive: true, force: true})

            const stagingDirectory = path.join(trialStagingDirectory, randomUUID())
            debug('[%s] Creating staging directory: %s', trial.id, stagingDirectory)
            await fs.mkdir(stagingDirectory, {recursive: true})

            return {
              directory: getTrialDirectory(trial),
              stagingDirectory,
            }
          },
          catch: cause => {
            return new TrialStoreError({
              trialId: trial.id,
              message: `Unable to create staging directory: ${trialStagingDirectory}`,
              cause,
            })
          },
        }),
        () => {
          return Effect.promise(async () => {
            try {
              await fs.rm(trialStagingDirectory, {recursive: true, force: true})
            } catch (error) {
              logError({err: error}, '[%s] Failed to remove staging directory: %s', trial.id, trialStagingDirectory)
            }
          })
        },
      )
    },

    commit({directory, stagingDirectory}, trial, result) {
      const record: z.input<typeof TrialCommitSchema> = {
        version: 1,
        committedAt: new Date().toISOString(),
        trial: getTrialIdentity(trial),
        result: {
          agent: result.agent,
          artifacts: result.artifacts,
          checks: result.checks,
          judges: result.judges,
          walkthrough: result.walkthrough,
        },
      }

      return Effect.tryPromise({
        try: async () => {
          await fs.writeFile(
            path.join(stagingDirectory, TRIAL_COMMIT_FILENAME),
            JSON.stringify(record, null, 2),
            'utf-8',
          )

          debug('[%s] Replacing trial directory: %s', trial.id, directory)
          await fs.rm(directory, {recursive: true, force: true})
          await fs.mkdir(path.dirname(directory), {recursive: true})
          // The rename is the commit point: a crash before it leaves no
          // commit record under the artifacts directory.
          await fs.rename(stagingDirectory, directory)
        },
        catch: cause => {
          return new TrialStoreError({
            trialId: trial.id,
            message: `Unable to commit trial to: ${directory}`,
            cause,
          })
        },
      })
    },
  }
}

export {TRIAL_COMMIT_FILENAME, TrialStoreError, createTrialStore, parseTrialCommit}
export type {CreateTrialStoreOptions, TrialCommit, TrialStore}
