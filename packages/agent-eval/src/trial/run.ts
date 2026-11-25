import path from 'node:path'
import {inspect} from 'node:util'
import {Data, Effect, Semaphore} from 'effect'
import * as z from 'zod/mini'
import {DefaultHost, type Host} from '../host'
import {logger, debug, info, warn} from '../logger'
import {AGENTS_DIR, CONTAINER_WORKDIR, COPILOT_DIR, NODE_USER, SKILLS_DIR, type Sandbox} from '../sandbox'
import {TrialSchema, type Trial} from './trial'
import {runCopilotCli} from '../copilot-cli'
import {runCopilotSdk} from '../copilot-sdk'
import {getCopilotTelemetryEnv} from '../copilot-runner'
import {
  getJudgeModel,
  getJudgePrompt,
  getJudgeReportFilename,
  JudgeOutputSchema,
  parseJudgeReport,
  type JudgeOutput,
  type JudgeResult,
} from '../judge'
import {AgentSessionSchema, getAgentSession} from '../agent'
import {CheckOutputSchema, type CheckOutput} from '../check'

const TrialWalkthroughSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('Unavailable')}),
  z.object({type: z.literal('Screenshot'), filepath: z.string()}),
  z.object({type: z.literal('Screenshots'), screenshots: z.array(z.string())}),
  z.object({type: z.literal('Video'), filepath: z.string()}),
])

type TrialWalkthrough = z.infer<typeof TrialWalkthroughSchema>

const TrialAgentSchema = z.object({
  sessions: z.array(AgentSessionSchema),
})

const TrialArtifactsSchema = z.object({
  directory: z.string(),
  copilotConfigDirectory: z.string(),
  skillsConfigDirectory: z.string(),
  walkthroughDirectory: z.string(),
  workspaceDirectory: z.string(),
})

const TrialChecksSchema = z.array(CheckOutputSchema)

const TrialJudgesSchema = z.array(JudgeOutputSchema)

const RunTrialResultSchema = z.object({
  agent: TrialAgentSchema,
  artifacts: TrialArtifactsSchema,
  checks: TrialChecksSchema,
  judges: TrialJudgesSchema,
  trial: TrialSchema,
  walkthrough: TrialWalkthroughSchema,
})

type RunTrialResult = z.infer<typeof RunTrialResultSchema>

type TrialArtifactLocation = {
  directory: string
  stagingDirectory: string
}

type TrialStage = 'Setup' | 'Task' | 'Verify' | 'Judge' | 'Capture' | 'Save'

class TrialStageError extends Data.TaggedError('TrialStageError')<{
  readonly trialId: string
  readonly stage: TrialStage
  readonly cause: unknown
}> {
  override get message() {
    const reason = this.cause instanceof Error ? this.cause.message : inspect(this.cause)
    return `Trial ${this.trialId} failed during ${this.stage}: ${reason}`
  }
}

type RunTrialOptions = {
  artifacts: TrialArtifactLocation
  copilotSemaphore: Semaphore.Semaphore
  copilotToken: string
  host?: Host
  sandbox: Sandbox
  trial: Trial
}

function attempt<A>(evaluate: () => PromiseLike<A>): Effect.Effect<A, unknown> {
  return Effect.tryPromise({
    try: evaluate,
    catch: cause => {
      return cause
    },
  })
}

function runTrial({
  artifacts,
  copilotSemaphore,
  copilotToken,
  host = DefaultHost,
  sandbox,
  trial,
}: RunTrialOptions): Effect.Effect<RunTrialResult, TrialStageError> {
  function stage<A>(name: TrialStage, effect: Effect.Effect<A, unknown>): Effect.Effect<A, TrialStageError> {
    return effect.pipe(
      Effect.catchDefect(defect => {
        return Effect.fail(defect)
      }),
      Effect.mapError(cause => {
        return new TrialStageError({trialId: trial.id, stage: name, cause})
      }),
    )
  }

  return Effect.gen(function* () {
    info('Running trial: %s', trial.id)

    yield* stage('Setup', setupStage({sandbox, trial}))

    const {agent} = yield* stage('Task', taskStage({copilotSemaphore, copilotToken, sandbox, trial}))

    const {results: checks} = yield* stage('Verify', verifyStage({sandbox, trial}))

    const {results: judges} = yield* stage('Judge', judgeStage({copilotSemaphore, copilotToken, sandbox, trial}))

    const {walkthrough} = yield* stage('Capture', captureStage({copilotSemaphore, copilotToken, sandbox, trial}))

    const {artifacts: savedArtifacts} = yield* stage('Save', saveStage({artifacts, host, sandbox, trial, walkthrough}))

    return {
      artifacts: savedArtifacts,
      agent,
      checks,
      trial,
      judges,
      walkthrough,
    }
  })
}

type SetupStageOptions = {
  sandbox: Sandbox
  trial: Trial
}

function setupStage({sandbox, trial}: SetupStageOptions) {
  return Effect.gen(function* () {
    info('[%s] Running setup', trial.id)

    const scenarioSetup = trial.scenario.setup
    if (scenarioSetup) {
      info('[%s] Running scenario setup', trial.id)
      yield* attempt(() => {
        return scenarioSetup({sandbox})
      })
    }

    const trialSetup = trial.setup
    if (trialSetup) {
      info('[%s] Running trial setup', trial.id)
      yield* attempt(() => {
        return trialSetup({sandbox})
      })
    }

    const treatmentSetup = trial.treatment.setup
    if (treatmentSetup) {
      info('[%s] Running treatment setup', trial.id)
      yield* attempt(() => {
        return treatmentSetup({sandbox})
      })
    }
  })
}

type CopilotStageOptions = {
  copilotSemaphore: Semaphore.Semaphore
  copilotToken: string
  sandbox: Sandbox
  trial: Trial
}

function taskStage({copilotSemaphore, copilotToken, sandbox, trial}: CopilotStageOptions) {
  return Effect.gen(function* () {
    info('[%s] Running agent', trial.id)

    const messages = yield* Semaphore.withPermits(
      copilotSemaphore,
      1,
    )(
      attempt(() => {
        if (trial.runner === 'copilot-sdk') {
          return runCopilotSdk({
            sandbox,
            prompt: trial.scenario.prompt,
            model: trial.model,
            copilotToken,
          })
        }

        return runCopilotCli({
          sandbox,
          prompt: trial.scenario.prompt,
          model: trial.model,
          copilotToken,
        })
      }),
    )

    return {
      agent: {
        sessions: [getAgentSession(messages)],
      },
    }
  })
}

type VerifyStageOptions = {
  sandbox: Sandbox
  trial: Trial
}

function verifyStage({sandbox, trial}: VerifyStageOptions) {
  return Effect.gen(function* () {
    info('[%s] Running checks', trial.id)

    const results: Array<CheckOutput> = []

    for (const check of trial.scenario.checks) {
      const copied = new Set<string>()

      for (const {filepath, relativePath} of check.files) {
        debug('[%s] Copying check file: %s to %s', trial.id, filepath, relativePath)
        yield* attempt(() => {
          return sandbox.copy(filepath, relativePath)
        })
        copied.add(relativePath)
      }

      if (copied.size > 0) {
        yield* attempt(() => {
          return sandbox.runCommand('chown', ['-R', NODE_USER, '--', ...Array.from(copied)], {
            user: 'root',
          })
        })
      }

      info('[%s] Running check: %s', trial.id, check.name)

      const checkRunResults = yield* attempt(() => {
        return check.run({
          logger: logger.child({
            trialId: trial.id,
            check: check.name,
          }),
          sandbox,
        })
      })

      results.push(
        ...checkRunResults.map(runResult => {
          return {
            check: {
              name: check.name,
              description: check.description,
              files: check.files,
            },
            result: runResult,
          }
        }),
      )

      if (copied.size > 0) {
        debug('[%s] Cleaning up check files: %o', trial.id, Array.from(copied))
        yield* attempt(() => {
          return sandbox.runCommand('rm', ['-rf', ...Array.from(copied)], {
            user: NODE_USER,
          })
        })
      }
    }

    return {
      results,
    }
  })
}

function judgeStage({copilotSemaphore, copilotToken, sandbox, trial}: CopilotStageOptions) {
  return Effect.gen(function* () {
    debug('Running judge stage for: %s', trial.id)

    const results: Array<JudgeOutput> = []

    if (trial.scenario.judges.length < 1) {
      return {
        results,
      }
    }

    info('[%s] Running judges', trial.id)

    for (const judge of trial.scenario.judges) {
      info('[%s] Running judge: %s', trial.id, judge.name)

      for (const file of judge.files) {
        debug('[%s] Copying judge file: %s to %s', trial.id, file.filepath, file.relativePath)
        yield* attempt(() => {
          return sandbox.copy(file.filepath, file.relativePath)
        })
      }

      if (judge.files.length > 0) {
        yield* attempt(() => {
          return sandbox.runCommand(
            'chown',
            [
              '-R',
              NODE_USER,
              '--',
              ...judge.files.map(file => {
                return file.relativePath
              }),
            ],
            {
              user: 'root',
            },
          )
        })
      }

      const model = getJudgeModel(judge, trial)
      const prompt = getJudgePrompt(judge)
      const messages = yield* Semaphore.withPermits(
        copilotSemaphore,
        1,
      )(
        attempt(() => {
          return runCopilotCli({sandbox, prompt, model, copilotToken})
        }),
      )
      const session = getAgentSession(messages)
      const judgeReportPath = getJudgeReportFilename(judge)

      let result: JudgeResult
      if (
        yield* attempt(() => {
          return sandbox.exists(judgeReportPath)
        })
      ) {
        const report = yield* attempt(() => {
          return sandbox.readFile(judgeReportPath)
        })
        result = parseJudgeReport(judge, report)
        if (result.type === 'error') {
          warn('[%s] Judge "%s" report is invalid: %s', trial.id, judge.name, result.message)
        }

        debug('[%s] Cleaning up judge report: %s', trial.id, judgeReportPath)
        yield* attempt(() => {
          return sandbox.runCommand('rm', ['-rf', judgeReportPath], {
            user: NODE_USER,
          })
        })
      } else {
        warn('[%s] Judge "%s" did not write its report: %s', trial.id, judge.name, judgeReportPath)
        result = {type: 'unknown'}
      }

      for (const file of judge.files) {
        debug('[%s] Cleaning up judge file: %s', trial.id, file.relativePath)
        yield* attempt(() => {
          return sandbox.runCommand('rm', ['-rf', file.relativePath], {
            user: NODE_USER,
          })
        })
      }

      results.push({
        judge,
        result,
        agent: {
          session,
        },
      })
    }

    return {
      results,
    }
  })
}

const WALKTHROUGH_DIR = 'walkthrough'
const WALKTHROUGH_VIEWPORT_WIDTH = 1440
const WALKTHROUGH_VIEWPORT_HEIGHT = 900
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg'])
const AGENT_BROWSER_SKILL_DIRECTORY = path.posix.join(SKILLS_DIR, 'agent-browser')

function captureStage({copilotSemaphore, copilotToken, sandbox, trial}: CopilotStageOptions) {
  return Effect.gen(function* () {
    info('[%s] Capturing walkthrough', trial.id)

    yield* attempt(() => {
      return sandbox.runCommand(
        'npm',
        ['install', '-g', '--prefix', '/home/node/.npm-global', '--allow-scripts=agent-browser', 'agent-browser'],
        {
          user: NODE_USER,
        },
      )
    })
    yield* attempt(() => {
      return sandbox.runCommand(
        'npx',
        [
          'skills',
          'add',
          'vercel-labs/agent-browser',
          '--yes',
          '--skill',
          '*',
          '--global',
          '--agent',
          'github-copilot',
        ],
        {
          user: NODE_USER,
        },
      )
    })
    yield* attempt(() => {
      return sandbox.writeFile(
        'agent-browser.json',
        JSON.stringify({
          executablePath: '/usr/bin/chromium',
        }),
      )
    })
    const walkthroughPrompt = `Record a visual walkthrough of what you implemented so a reviewer can see it without running the code themselves.

Figure out how to start this project's server (for example by checking package.json scripts or the README) and run it in the background. Use the agent-browser CLI (already installed) to open the running app and set the browser viewport to ${WALKTHROUGH_VIEWPORT_WIDTH}x${WALKTHROUGH_VIEWPORT_HEIGHT} before capturing anything.

Save the result inside a "${WALKTHROUGH_DIR}" directory (create it if it doesn't exist) at the root of the project:

- If what you built is a single screen, take one screenshot and save it as ${WALKTHROUGH_DIR}/screenshot.png.
- If there are a few distinct views worth showing (for example separate pages or states), take a screenshot of each, in the order a reviewer should look at them, saved as ${WALKTHROUGH_DIR}/screenshots/01.png, ${WALKTHROUGH_DIR}/screenshots/02.png, etc.
- If reviewing the change requires seeing an interactive flow across multiple steps or pages, record a short video of yourself clicking through it instead and save it as ${WALKTHROUGH_DIR}/walkthrough.webm.

After saving and verifying the walkthrough artifacts, close the agent-browser session you opened and stop the development server and any other background processes you started. Use stop_bash with the shellId returned when starting an async Bash command, and verify that it has stopped. Only clean up processes and browser sessions you started; leave unrelated processes and the saved artifacts intact. Complete this cleanup before calling task_complete so background processes do not keep the Copilot CLI running. If cleanup fails, report the failure instead of claiming completion.

Only capture the walkthrough, do not make any further code changes.`
    const walkthroughResult = yield* Semaphore.withPermits(
      copilotSemaphore,
      1,
    )(
      attempt(() => {
        return sandbox.runCommand(
          // 'copilot',
          '/opt/agent-eval/copilot/bin/copilot',
          [
            '--prompt',
            walkthroughPrompt,
            '--model',
            'gpt-5.6-terra',
            '--reasoning-effort',
            'medium',
            '--mode',
            'autopilot',
            '--allow-all',
            '--output-format',
            'json',
          ],
          {
            user: NODE_USER,
            env: {
              COPILOT_GITHUB_TOKEN: copilotToken,
              ...getCopilotTelemetryEnv(),
            },
            allowNonZeroExitCode: true,
          },
        )
      }),
    )

    if (walkthroughResult.exitCode !== 0) {
      warn('[%s] Unable to capture walkthrough: %s', trial.id, walkthroughResult.stderr)
    }

    debug('[%s] Removing walkthrough skill...', trial.id)
    yield* attempt(() => {
      return sandbox.runCommand('rm', ['-rf', AGENT_BROWSER_SKILL_DIRECTORY], {
        user: NODE_USER,
      })
    })

    const walkthrough = yield* attempt(() => {
      return detectWalkthrough(sandbox)
    })

    return {
      walkthrough,
    }
  })
}

async function detectWalkthrough(sandbox: Sandbox): Promise<TrialWalkthrough> {
  if (await sandbox.exists(path.posix.join(WALKTHROUGH_DIR, 'screenshot.png'))) {
    return {
      type: 'Screenshot',
      filepath: path.posix.join(WALKTHROUGH_DIR, 'screenshot.png'),
    }
  }

  if (await sandbox.exists(path.posix.join(WALKTHROUGH_DIR, 'screenshots'))) {
    const entries = await sandbox.readdir(path.posix.join(WALKTHROUGH_DIR, 'screenshots'))
    const screenshots = entries
      .filter(filename => {
        return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase())
      })
      .toSorted((a, b) => {
        return a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'})
      })

    if (screenshots.length > 0) {
      return {
        type: 'Screenshots',
        screenshots: screenshots.map(filename => {
          return path.posix.join(WALKTHROUGH_DIR, 'screenshots', filename)
        }),
      }
    }

    return {
      type: 'Unavailable',
    }
  }

  if (await sandbox.exists(path.posix.join(WALKTHROUGH_DIR, 'walkthrough.webm'))) {
    return {
      type: 'Video',
      filepath: path.posix.join(WALKTHROUGH_DIR, 'walkthrough.webm'),
    }
  }

  return {
    type: 'Unavailable',
  }
}

type SaveStageOptions = {
  artifacts: TrialArtifactLocation
  host: Host
  sandbox: Sandbox
  trial: Trial
  walkthrough: TrialWalkthrough
}

const ARTIFACT_SUBDIRECTORIES = {
  workspace: 'workspace',
  walkthrough: 'walkthrough',
  copilotConfig: '.copilot',
  skillsConfig: '.agents',
} as const

function saveStage({artifacts, host, sandbox, trial, walkthrough}: SaveStageOptions) {
  return attempt(async () => {
    info('[%s] Saving trial results', trial.id)

    const {directory, stagingDirectory} = artifacts
    const stagingWorkspaceDirectory = path.join(stagingDirectory, ARTIFACT_SUBDIRECTORIES.workspace)
    const stagingWalkthroughDirectory = path.join(stagingDirectory, ARTIFACT_SUBDIRECTORIES.walkthrough)
    const stagingCopilotConfigDirectory = path.join(stagingDirectory, ARTIFACT_SUBDIRECTORIES.copilotConfig)
    const stagingSkillsConfigDirectory = path.join(stagingDirectory, ARTIFACT_SUBDIRECTORIES.skillsConfig)

    debug('[%s] Creating workspace directory: %s', trial.id, stagingWorkspaceDirectory)
    await host.fs.promises.mkdir(stagingWorkspaceDirectory, {recursive: true})

    info('[%s] Downloading artifacts to: %s', trial.id, stagingDirectory)

    debug('[%s] Downloading agent workspace to: %s', trial.id, stagingWorkspaceDirectory)
    const judgeFiles = Array.from(
      new Set(
        trial.scenario.judges.flatMap(judge => {
          return judge.files.map(file => {
            return file.relativePath
          })
        }),
      ),
    )
    await sandbox.download(CONTAINER_WORKDIR, stagingWorkspaceDirectory, {
      ignore(name) {
        const relativePath = (path.isAbsolute(name) ? path.relative(stagingWorkspaceDirectory, name) : name)
          .split(path.sep)
          .join(path.posix.sep)
        if (
          judgeFiles.some(judgeFileRelativePath => {
            return (
              relativePath === judgeFileRelativePath ||
              relativePath.startsWith(`${judgeFileRelativePath}/`) ||
              judgeFileRelativePath.startsWith(`${relativePath}/`)
            )
          })
        ) {
          return false
        }
        return (
          name.includes('node_modules') ||
          name.includes('.next') ||
          name.includes('.turbo') ||
          name.includes('dist') ||
          name.includes(WALKTHROUGH_DIR)
        )
      },
    })

    debug('[%s] Downloading copilot config to: %s', trial.id, stagingCopilotConfigDirectory)
    await sandbox.download(COPILOT_DIR, stagingCopilotConfigDirectory)

    debug('[%s] Downloading skills config to: %s', trial.id, stagingSkillsConfigDirectory)
    await sandbox.download(AGENTS_DIR, stagingSkillsConfigDirectory)

    if (walkthrough.type !== 'Unavailable') {
      await host.fs.promises.mkdir(stagingWalkthroughDirectory, {
        recursive: true,
      })

      await sandbox.download(WALKTHROUGH_DIR, stagingWalkthroughDirectory)
    }

    return {artifacts: getTrialArtifacts(directory)}
  })
}

function getTrialArtifacts(directory: string): RunTrialResult['artifacts'] {
  return {
    directory,
    copilotConfigDirectory: path.join(directory, ARTIFACT_SUBDIRECTORIES.copilotConfig),
    skillsConfigDirectory: path.join(directory, ARTIFACT_SUBDIRECTORIES.skillsConfig),
    walkthroughDirectory: path.join(directory, ARTIFACT_SUBDIRECTORIES.walkthrough),
    workspaceDirectory: path.join(directory, ARTIFACT_SUBDIRECTORIES.workspace),
  }
}

export {
  TrialAgentSchema,
  TrialArtifactsSchema,
  TrialChecksSchema,
  TrialJudgesSchema,
  TrialStageError,
  TrialWalkthroughSchema,
  getTrialArtifacts,
  runTrial,
  RunTrialResultSchema,
}
export type {RunTrialResult, TrialArtifactLocation, TrialStage}
