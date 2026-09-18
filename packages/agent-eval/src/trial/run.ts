import path from 'node:path'
import type Queue from 'p-queue'
import * as z from 'zod/mini'
import {DefaultHost, type Host} from '../host'
import {logger} from '../logger'
import {
  AGENTS_DIR,
  CONTAINER_WORKDIR,
  COPILOT_DIR,
  NODE_USER,
  SKILLS_DIR,
  type DownloadOptions,
  type Sandbox,
} from '../sandbox'
import {TrialSchema, type Trial} from './trial'
import {parseMessage, type Message} from '../copilot-cli'
import {runCopilotSdk} from '../copilot-sdk'
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

const REDACTED_VALUE = '[REDACTED]'
const CREDENTIAL_FILENAMES = new Set([
  '.env',
  '.npmrc',
  'auth.json',
  'credentials.json',
  'hosts.json',
  'oauth.json',
  'token.json',
  'tokens.json',
])

type TrialWalkthrough = z.infer<typeof TrialWalkthroughSchema>

type TrialExecutionOptions = {
  /**
   * Capture a visual walkthrough with a separate Copilot session.
   * @default true
   */
  captureWalkthrough?: boolean
  /**
   * Install scenario dependencies before setup and candidate execution.
   * @default true
   */
  installDependencies?: boolean
  /**
   * Maximum wall-clock duration for the complete trial.
   */
  timeoutMs?: number
}

type TrialAttemptOptions = {
  maxRetries: number
  number: number
}

type TrialPhase = 'setup' | 'task' | 'checks' | 'judges' | 'walkthrough' | 'save'
type TrialFailureKind = 'execution' | 'timeout'

type TrialFailure = {
  artifacts: {
    directory: string
    failurePath: string
    workspaceDirectory: string
  }
  artifactCaptureErrors?: Array<string>
  attempt: number
  completedAt: string
  error: {
    message: string
    name: string
  }
  kind: TrialFailureKind
  maxRetries: number
  phase: TrialPhase
  redactionApplied: boolean
  startedAt: string
  status: 'failed'
  trialId: string
}

class TrialTimeoutError extends Error {
  constructor(timeoutMs: number, options?: ErrorOptions) {
    const suffix = options?.cause ? '; failure evidence capture or sandbox disposal failed' : ''
    super(`Trial timed out after ${timeoutMs}ms${suffix}`, options)
    this.name = 'TrialTimeoutError'
  }
}

class TrialExecutionError extends Error {
  failure: TrialFailure

  constructor(failure: TrialFailure, options?: ErrorOptions) {
    super(
      `Trial "${failure.trialId}" failed during ${failure.phase} (${failure.kind}); evidence: ${failure.artifacts.failurePath}`,
      options,
    )
    this.name = 'TrialExecutionError'
    this.failure = failure
  }
}

type RunTrialOptions = {
  artifactsDirectory: string
  attempt?: TrialAttemptOptions
  copilotQueue: Queue
  copilotToken: string
  host?: Host
  sandbox: Sandbox
  trial: Trial
  execution?: TrialExecutionOptions
}

const TrialAgentSchema = z.object({
  sessions: z.array(AgentSessionSchema),
})

const TrialArtifactsSchema = z.object({
  directory: z.string(),
  copilotConfigDirectory: z.string(),
  skillsConfigDirectory: z.string(),
  walkthroughDirectory: z.string(),
  workspaceDirectory: z.string(),
  redactionApplied: z.optional(z.boolean()),
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

async function runTrial({
  artifactsDirectory,
  copilotQueue,
  copilotToken,
  host = DefaultHost,
  sandbox,
  trial,
  execution: executionInput,
  attempt = {maxRetries: 0, number: 1},
}: RunTrialOptions): Promise<RunTrialResult> {
  const execution = validateTrialExecutionOptions(executionInput)
  const startedAt = new Date().toISOString()
  const redaction = {applied: false}
  let phase: TrialPhase = 'setup'
  let timeoutFailure: TrialFailure | undefined

  try {
    return await withTrialTimeout(
      () =>
        executeTrial({
          artifactsDirectory,
          copilotQueue,
          copilotToken,
          host,
          sandbox,
          trial,
          execution,
          redaction,
          onPhase(nextPhase) {
            phase = nextPhase
          },
        }),
      execution.timeoutMs,
      sandbox,
      async timeoutError => {
        timeoutFailure = await captureTrialFailure({
          artifactsDirectory,
          attempt,
          copilotToken,
          error: timeoutError,
          host,
          kind: 'timeout',
          phase,
          redaction,
          sandbox,
          startedAt,
          trial,
          workspaceCaptureGraceMs: 1_000,
        })
      },
    )
  } catch (error) {
    if (timeoutFailure) {
      if (error instanceof TrialTimeoutError && error.cause) {
        timeoutFailure.artifactCaptureErrors = [
          ...(timeoutFailure.artifactCaptureErrors ?? []),
          redactExactSecret(getErrorMessage(error.cause), copilotToken, redaction),
        ]
        timeoutFailure.redactionApplied = redaction.applied
        await host.fs.writeFile(timeoutFailure.artifacts.failurePath, JSON.stringify(timeoutFailure, null, 2), 'utf-8')
      }
      throw new TrialExecutionError(timeoutFailure, {
        cause: createRedactedError(error, copilotToken, redaction),
      })
    }

    let failure: TrialFailure
    try {
      failure = await captureTrialFailure({
        artifactsDirectory,
        attempt,
        copilotToken,
        error,
        host,
        kind: 'execution',
        phase,
        redaction,
        sandbox,
        startedAt,
        trial,
      })
    } catch (captureError) {
      const redactedError = createRedactedError(error, copilotToken, redaction)
      const redactedCaptureError = createRedactedError(captureError, copilotToken, redaction)
      throw new AggregateError(
        [redactedError, redactedCaptureError],
        `Trial "${trial.id}" failed and evidence could not be saved`,
        {
          // eslint-disable-next-line preserve-caught-error -- Original errors may contain the active credential.
          cause: redactedCaptureError,
        },
      )
    }
    throw new TrialExecutionError(failure, {
      cause: createRedactedError(error, copilotToken, redaction),
    })
  }
}

type ExecuteTrialOptions = Omit<RunTrialOptions, 'execution'> & {
  execution: Required<Pick<TrialExecutionOptions, 'captureWalkthrough' | 'installDependencies'>> & TrialExecutionOptions
  onPhase: (phase: TrialPhase) => void
  redaction: RedactionState
}

async function executeTrial({
  artifactsDirectory,
  copilotQueue,
  copilotToken,
  host = DefaultHost,
  sandbox,
  trial,
  execution,
  onPhase,
  redaction,
}: ExecuteTrialOptions): Promise<RunTrialResult> {
  logger.info('Running trial: %s', trial.id)

  onPhase('setup')
  await setupStage.run({
    execution,
    sandbox,
    trial,
  })

  onPhase('task')
  const {agent} = await taskStage.run({
    copilotQueue,
    copilotToken,
    sandbox,
    trial,
  })

  onPhase('checks')
  const {results: checks} = await verifyStage.run({
    sandbox,
    trial,
  })

  onPhase('judges')
  const {results: judges} = await judgeStage.run({
    copilotQueue,
    copilotToken,
    sandbox,
    trial,
  })

  onPhase('walkthrough')
  const {walkthrough} = execution.captureWalkthrough
    ? await captureStage.run({
        copilotQueue,
        copilotToken,
        sandbox,
        trial,
      })
    : {walkthrough: {type: 'Unavailable'} as const}

  onPhase('save')
  const {artifacts} = await saveStage.run({
    artifactsDirectory,
    host,
    copilotToken,
    redaction,
    sandbox,
    trial,
    walkthrough,
  })

  const result: RunTrialResult = {
    artifacts,
    agent,
    checks,
    trial,
    judges,
    walkthrough,
  }
  const safeResult = redactValue(result, copilotToken, redaction)
  safeResult.artifacts.redactionApplied = redaction.applied
  return safeResult
}

type SetupStageOptions = {
  execution: Required<Pick<TrialExecutionOptions, 'captureWalkthrough' | 'installDependencies'>> & TrialExecutionOptions
  sandbox: Sandbox
  trial: Trial
}

const setupStage = {
  name: 'Setup',
  async run({execution, sandbox, trial}: SetupStageOptions) {
    logger.info('[%s] Running setup', trial.id)

    logger.info('[%s] Copying files from: %s...', trial.id, trial.scenario.directory)

    const judgeFiles = trial.scenario.judges.flatMap(judge => {
      return judge.files.map(({filepath}) => {
        return filepath
      })
    })
    const checkFiles = trial.scenario.checks.flatMap(check => {
      return check.files.map(({relativePath}) => {
        return relativePath
      })
    })
    const exclude = Array.from(
      new Set([
        'scenario.config.ts',
        'scenario.test.ts',
        'browser.test.ts',
        'scenario.browser.test.ts',
        'node_modules',
        '.next',
        'dist',
        ...judgeFiles,
        ...checkFiles,
      ]),
    )

    logger.debug('[%s] Excluding files: %o', trial.id, exclude)

    await sandbox.copy(trial.scenario.directory, CONTAINER_WORKDIR, {
      exclude,
    })
    await sandbox.runCommand('chown', ['-R', NODE_USER, '.'], {
      user: 'root',
    })

    logger.info('[%s] Obfuscating package name', trial.id)
    await sandbox.runCommand('npm', ['pkg', 'set', `name=${trial.id}`], {
      user: NODE_USER,
    })

    logger.info('[%s] Removing workspace dependency', trial.id)
    await sandbox.runCommand('npm', ['pkg', 'delete', 'devDependencies.@primer/agent-eval'], {
      user: NODE_USER,
    })

    if (execution.installDependencies) {
      logger.info('[%s] Installing dependencies', trial.id)
      await sandbox.runCommand('npm', ['install'], {
        user: NODE_USER,
      })
    }

    if (trial.setup) {
      logger.info('[%s] Running generic setup', trial.id)
      await trial.setup({
        sandbox,
      })
    }

    if (trial.treatment.setup) {
      logger.info('[%s] Running treatment setup', trial.id)
      await trial.treatment.setup({
        sandbox,
      })
    }

    logger.info('[%s] Running build script', trial.id)
    await sandbox.runCommand('npm', ['run', 'build', '--if-present'], {
      user: NODE_USER,
    })
  },
}

type RunStageOptions = {
  copilotQueue: Queue
  copilotToken: string
  sandbox: Sandbox
  trial: Trial
}

const taskStage = {
  name: 'Task',
  async run({copilotQueue, copilotToken, sandbox, trial}: RunStageOptions) {
    logger.info('[%s] Running agent', trial.id)

    const messages = await copilotQueue.add(async () => {
      if (trial.runner === 'copilot-sdk') {
        return runCopilotSdk({
          sandbox,
          prompt: trial.scenario.prompt,
          model: trial.model,
          copilotToken,
        })
      }

      const copilotOutput = await sandbox.runCommand(
        'copilot',
        [
          '--prompt',
          trial.scenario.prompt,
          '--model',
          trial.model.name,
          '--reasoning-effort',
          trial.model.reasoningEffort,
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
          },
        },
      )
      return copilotOutput.stdout.split('\n').flatMap(line => {
        const trimmed = line.trim()
        if (trimmed.length === 0) {
          return []
        }
        return parseMessage(JSON.parse(trimmed))
      })
    })

    return {
      agent: {
        sessions: [getAgentSession(messages)],
      },
    }
  },
}

type VerifyStageOptions = {
  sandbox: Sandbox
  trial: Trial
}

const verifyStage = {
  name: 'Verify',
  async run({sandbox, trial}: VerifyStageOptions) {
    logger.info('[%s] Running checks', trial.id)

    const results: Array<CheckOutput> = []

    for (const check of trial.scenario.checks) {
      const copied = new Set<string>()

      for (const {filepath, relativePath} of check.files) {
        logger.debug('[%s] Copying check file: %s to %s', trial.id, filepath, relativePath)
        await sandbox.copy(filepath, relativePath)
        copied.add(relativePath)
      }

      if (copied.size > 0) {
        await sandbox.runCommand('chown', ['-R', NODE_USER, '--', ...Array.from(copied)], {
          user: 'root',
        })
      }

      logger.info('[%s] Running check: %s', trial.id, check.name)

      const checkRunResults = await check.run({
        logger: logger.child({
          trialId: trial.id,
          check: check.name,
        }),
        sandbox,
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
        logger.debug('[%s] Cleaning up check files: %o', trial.id, Array.from(copied))
        await sandbox.runCommand('rm', ['-rf', ...Array.from(copied)], {
          user: NODE_USER,
        })
      }
    }

    return {
      results,
    }
  },
}

type JudgeStageOptions = {
  copilotQueue: Queue
  copilotToken: string
  sandbox: Sandbox
  trial: Trial
}

const judgeStage = {
  name: 'Judge',
  async run({copilotQueue, copilotToken, sandbox, trial}: JudgeStageOptions) {
    logger.debug('Running judge stage for: %s', trial.id)

    const results: Array<JudgeOutput> = []

    if (trial.scenario.judges.length < 1) {
      return {
        results,
      }
    }

    logger.info('[%s] Running judges', trial.id)

    for (const judge of trial.scenario.judges) {
      logger.info('[%s] Running judge: %s', trial.id, judge.name)

      for (const file of judge.files) {
        logger.debug('[%s] Copying judge file: %s to %s', trial.id, file.filepath, file.relativePath)
        await sandbox.copy(file.filepath, file.relativePath)
      }

      if (judge.files.length > 0) {
        await sandbox.runCommand(
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
      }

      const model = getJudgeModel(judge, trial)
      const prompt = getJudgePrompt(judge)
      const copilotOutput = await copilotQueue.add(async () => {
        return await sandbox.runCommand(
          'copilot',
          [
            '--prompt',
            prompt,
            '--model',
            model.name,
            '--reasoning-effort',
            model.reasoningEffort,
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
            },
          },
        )
      })
      const messages: Array<Message> = copilotOutput.stdout.split('\n').flatMap(line => {
        const trimmed = line.trim()
        if (trimmed.length === 0) {
          return []
        }
        return parseMessage(JSON.parse(trimmed))
      })
      const session = getAgentSession(messages)
      const judgeReportPath = getJudgeReportFilename(judge)

      let result: JudgeResult
      if (await sandbox.exists(judgeReportPath)) {
        result = parseJudgeReport(judge, await sandbox.readFile(judgeReportPath))
        if (result.type === 'error') {
          logger.warn('[%s] Judge "%s" report is invalid: %s', trial.id, judge.name, result.message)
        }

        logger.debug('[%s] Cleaning up judge report: %s', trial.id, judgeReportPath)
        await sandbox.runCommand('rm', ['-rf', judgeReportPath], {
          user: NODE_USER,
        })
      } else {
        logger.warn('[%s] Judge "%s" did not write its report: %s', trial.id, judge.name, judgeReportPath)
        result = {type: 'unknown'}
      }

      for (const file of judge.files) {
        logger.debug('[%s] Cleaning up judge file: %s', trial.id, file.relativePath)
        await sandbox.runCommand('rm', ['-rf', file.relativePath], {
          user: NODE_USER,
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
  },
}

const WALKTHROUGH_DIR = 'walkthrough'
const WALKTHROUGH_VIEWPORT_WIDTH = 1440
const WALKTHROUGH_VIEWPORT_HEIGHT = 900
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg'])
const AGENT_BROWSER_SKILL_DIRECTORY = path.posix.join(SKILLS_DIR, 'agent-browser')

type CaptureStageOptions = {
  copilotQueue: Queue
  copilotToken: string
  sandbox: Sandbox
  trial: Trial
}

const captureStage = {
  name: 'Capture',
  async run({copilotQueue, copilotToken, sandbox, trial}: CaptureStageOptions) {
    logger.info('[%s] Capturing walkthrough', trial.id)

    await sandbox.runCommand('npm', ['install', '-g', '--allow-scripts=agent-browser', 'agent-browser'], {
      user: NODE_USER,
    })
    await sandbox.runCommand(
      'npx',
      ['skills', 'add', 'vercel-labs/agent-browser', '--yes', '--skill', '*', '--global', '--agent', 'github-copilot'],
      {
        user: NODE_USER,
      },
    )
    await sandbox.writeFile(
      'agent-browser.json',
      JSON.stringify({
        executablePath: '/usr/bin/chromium',
      }),
    )
    const walkthroughPrompt = `Record a visual walkthrough of what you implemented so a reviewer can see it without running the code themselves.

Figure out how to start this project's server (for example by checking package.json scripts or the README) and run it in the background. Use the agent-browser CLI (already installed) to open the running app and set the browser viewport to ${WALKTHROUGH_VIEWPORT_WIDTH}x${WALKTHROUGH_VIEWPORT_HEIGHT} before capturing anything.

Save the result inside a "${WALKTHROUGH_DIR}" directory (create it if it doesn't exist) at the root of the project:

- If what you built is a single screen, take one screenshot and save it as ${WALKTHROUGH_DIR}/screenshot.png.
- If there are a few distinct views worth showing (for example separate pages or states), take a screenshot of each, in the order a reviewer should look at them, saved as ${WALKTHROUGH_DIR}/screenshots/01.png, ${WALKTHROUGH_DIR}/screenshots/02.png, etc.
- If reviewing the change requires seeing an interactive flow across multiple steps or pages, record a short video of yourself clicking through it instead and save it as ${WALKTHROUGH_DIR}/walkthrough.webm.

After saving and verifying the walkthrough artifacts, close the agent-browser session you opened and stop the development server and any other background processes you started. Use stop_bash with the shellId returned when starting an async Bash command, and verify that it has stopped. Only clean up processes and browser sessions you started; leave unrelated processes and the saved artifacts intact. Complete this cleanup before calling task_complete so background processes do not keep the Copilot CLI running. If cleanup fails, report the failure instead of claiming completion.

Only capture the walkthrough, do not make any further code changes.`
    const walkthroughResult = await copilotQueue.add(async () => {
      return await sandbox.runCommand(
        'copilot',
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
          },
          allowNonZeroExitCode: true,
        },
      )
    })

    if (walkthroughResult.exitCode !== 0) {
      logger.warn('[%s] Unable to capture walkthrough: %s', trial.id, walkthroughResult.stderr)
    }

    logger.debug('[%s] Removing walkthrough skill...', trial.id)
    await sandbox.runCommand('rm', ['-rf', AGENT_BROWSER_SKILL_DIRECTORY], {
      user: NODE_USER,
    })

    let walkthrough: TrialWalkthrough = {
      type: 'Unavailable',
    }

    if (await sandbox.exists(path.posix.join(WALKTHROUGH_DIR, 'screenshot.png'))) {
      walkthrough = {
        type: 'Screenshot',
        filepath: path.posix.join(WALKTHROUGH_DIR, 'screenshot.png'),
      }
    } else if (await sandbox.exists(path.posix.join(WALKTHROUGH_DIR, 'screenshots'))) {
      const entries = await sandbox.readdir(path.posix.join(WALKTHROUGH_DIR, 'screenshots'))
      const screenshots = entries
        .filter(filename => {
          return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase())
        })
        .toSorted((a, b) => {
          return a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'})
        })

      if (screenshots.length > 0) {
        walkthrough = {
          type: 'Screenshots',
          screenshots: screenshots.map(filename => {
            return path.posix.join(WALKTHROUGH_DIR, 'screenshots', filename)
          }),
        }
      }
    } else if (await sandbox.exists(path.posix.join(WALKTHROUGH_DIR, 'walkthrough.webm'))) {
      walkthrough = {
        type: 'Video',
        filepath: path.posix.join(WALKTHROUGH_DIR, 'walkthrough.webm'),
      }
    }

    return {
      walkthrough,
    }
  },
}

type SaveStageOptions = {
  artifactsDirectory: string
  copilotToken: string
  host: Host
  redaction: RedactionState
  sandbox: Sandbox
  trial: Trial
  walkthrough: TrialWalkthrough
}

const saveStage = {
  name: 'Save',
  async run({artifactsDirectory, copilotToken, host, redaction, sandbox, trial, walkthrough}: SaveStageOptions) {
    logger.info('[%s] Saving trial results', trial.id)

    const artifactDirectory = path.join(artifactsDirectory, trial.id)
    const workspaceDirectory = path.join(artifactDirectory, 'workspace')
    const walkthroughDirectory = path.join(artifactDirectory, 'walkthrough')
    const copilotConfigDirectory = path.join(artifactDirectory, '.copilot')
    const skillsConfigDirectory = path.join(artifactDirectory, '.agents')

    if (host.existsSync(artifactDirectory)) {
      logger.debug('[%s] Cleaning up artifact directory: %s', trial.id, artifactDirectory)
      await host.fs.rm(artifactDirectory, {recursive: true, force: true})
    }

    logger.debug('[%s] Creating artifact directory: %s', trial.id, artifactDirectory)
    await host.fs.mkdir(artifactDirectory, {recursive: true})

    logger.debug('[%s] Creating workspace directory: %s', trial.id, workspaceDirectory)
    await host.fs.mkdir(workspaceDirectory, {recursive: true})

    logger.info('[%s] Downloading artifacts to: %s', trial.id, artifactDirectory)

    logger.debug('[%s] Downloading agent workspace to: %s', trial.id, workspaceDirectory)
    const judgeFiles = Array.from(
      new Set(
        trial.scenario.judges.flatMap(judge => {
          return judge.files.map(file => {
            return file.relativePath
          })
        }),
      ),
    )
    await sandbox.download(CONTAINER_WORKDIR, workspaceDirectory, {
      ignore(name) {
        const relativePath = (path.isAbsolute(name) ? path.relative(workspaceDirectory, name) : name)
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
      transform: createArtifactRedactor(copilotToken, redaction),
    })

    logger.debug('[%s] Downloading copilot config to: %s', trial.id, copilotConfigDirectory)
    await sandbox.download(COPILOT_DIR, copilotConfigDirectory, {
      ignore: shouldIgnoreCredentialArtifact,
      transform: createArtifactRedactor(copilotToken, redaction),
    })

    logger.debug('[%s] Downloading skills config to: %s', trial.id, skillsConfigDirectory)
    await sandbox.download(AGENTS_DIR, skillsConfigDirectory, {
      transform: createArtifactRedactor(copilotToken, redaction),
    })

    if (walkthrough.type !== 'Unavailable') {
      await host.fs.mkdir(walkthroughDirectory, {
        recursive: true,
      })

      await sandbox.download(WALKTHROUGH_DIR, walkthroughDirectory, {
        transform: createArtifactRedactor(copilotToken, redaction),
      })
    }

    return {
      artifacts: {
        directory: artifactDirectory,
        copilotConfigDirectory,
        skillsConfigDirectory,
        walkthroughDirectory,
        workspaceDirectory,
      },
    }
  },
}

function validateTrialExecutionOptions(
  execution: TrialExecutionOptions = {},
): Required<Pick<TrialExecutionOptions, 'captureWalkthrough' | 'installDependencies'>> & TrialExecutionOptions {
  if (execution.timeoutMs !== undefined && (!Number.isSafeInteger(execution.timeoutMs) || execution.timeoutMs < 1)) {
    throw new Error('timeoutMs must be a positive safe integer')
  }
  if (execution.captureWalkthrough !== undefined && typeof execution.captureWalkthrough !== 'boolean') {
    throw new Error('captureWalkthrough must be a boolean')
  }
  if (execution.installDependencies !== undefined && typeof execution.installDependencies !== 'boolean') {
    throw new Error('installDependencies must be a boolean')
  }

  return {
    ...execution,
    captureWalkthrough: execution.captureWalkthrough ?? true,
    installDependencies: execution.installDependencies ?? true,
  }
}

async function withTrialTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number | undefined,
  sandbox: Sandbox,
  onTimeout: (error: TrialTimeoutError) => Promise<void>,
): Promise<T> {
  if (timeoutMs === undefined) {
    return operation()
  }

  let timer: NodeJS.Timeout | undefined
  let timedOut = false
  const pending = new Promise<never>(() => {})
  const operationPromise = operation().then(
    result => (timedOut ? pending : result),
    error => {
      if (timedOut) return pending
      throw error
    },
  )
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true
      const timeoutError = new TrialTimeoutError(timeoutMs)
      void (async () => {
        const errors: Array<unknown> = []
        try {
          await onTimeout(timeoutError)
        } catch (error) {
          errors.push(error)
        }
        try {
          await runWithGracePeriod(() => sandbox[Symbol.asyncDispose](), 10_000, 'Sandbox disposal')
        } catch (error) {
          errors.push(error)
        }

        if (errors.length === 0) {
          reject(timeoutError)
        } else {
          reject(
            new TrialTimeoutError(timeoutMs, {
              cause: errors.length === 1 ? errors[0] : new AggregateError(errors),
            }),
          )
        }
      })()
    }, timeoutMs)
  })

  try {
    return await Promise.race([operationPromise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

type CaptureTrialFailureOptions = {
  artifactsDirectory: string
  attempt: TrialAttemptOptions
  copilotToken: string
  error: unknown
  host: Host
  kind: TrialFailureKind
  phase: TrialPhase
  redaction: RedactionState
  sandbox: Sandbox
  startedAt: string
  trial: Trial
  workspaceCaptureGraceMs?: number
}

async function captureTrialFailure({
  artifactsDirectory,
  attempt,
  copilotToken,
  error,
  host,
  kind,
  phase,
  redaction,
  sandbox,
  startedAt,
  trial,
  workspaceCaptureGraceMs,
}: CaptureTrialFailureOptions): Promise<TrialFailure> {
  const directory = path.join(artifactsDirectory, 'failures', trial.id, `attempt-${attempt.number}`)
  const failurePath = path.join(directory, 'failure.json')
  const workspaceDirectory = path.join(directory, 'workspace')
  const artifactCaptureErrors: Array<string> = []
  const failure: TrialFailure = {
    artifacts: {
      directory,
      failurePath,
      workspaceDirectory,
    },
    attempt: attempt.number,
    completedAt: new Date().toISOString(),
    error: {
      message: redactExactSecret(error instanceof Error ? error.message : String(error), copilotToken, redaction),
      name: error instanceof Error ? error.name : 'Error',
    },
    kind,
    maxRetries: attempt.maxRetries,
    phase,
    redactionApplied: redaction.applied,
    startedAt,
    status: 'failed',
    trialId: trial.id,
  }

  await host.fs.rm(directory, {recursive: true, force: true})
  await host.fs.mkdir(directory, {recursive: true})
  await host.fs.writeFile(failurePath, JSON.stringify(failure, null, 2), 'utf-8')

  try {
    const captureWorkspace = () =>
      sandbox.download(CONTAINER_WORKDIR, workspaceDirectory, {
        ignore(name) {
          return shouldIgnoreDownloadedArtifact(name)
        },
        transform: createArtifactRedactor(copilotToken, redaction),
      })
    if (workspaceCaptureGraceMs === undefined) {
      await captureWorkspace()
    } else {
      await runWithGracePeriod(captureWorkspace, workspaceCaptureGraceMs, 'Failure workspace capture')
    }
  } catch (captureError) {
    artifactCaptureErrors.push(
      redactExactSecret(
        captureError instanceof Error ? captureError.message : String(captureError),
        copilotToken,
        redaction,
      ),
    )
  }

  failure.redactionApplied = redaction.applied
  if (artifactCaptureErrors.length > 0) {
    failure.artifactCaptureErrors = artifactCaptureErrors
  }
  await host.fs.writeFile(failurePath, JSON.stringify(failure, null, 2), 'utf-8')

  return failure
}

function getErrorMessage(error: unknown): string {
  if (error instanceof AggregateError) {
    return error.errors.map(getErrorMessage).join('; ')
  }
  return error instanceof Error ? error.message : String(error)
}

type RedactionState = {
  applied: boolean
}

function createRedactedError(error: unknown, secret: string, redaction: RedactionState): Error {
  if (error instanceof AggregateError) {
    return new AggregateError(
      error.errors.map(item => createRedactedError(item, secret, redaction)),
      redactExactSecret(error.message, secret, redaction),
    )
  }

  const result = new Error(redactExactSecret(error instanceof Error ? error.message : String(error), secret, redaction))
  result.name = error instanceof Error ? error.name : 'Error'
  return result
}

function redactExactSecret(contents: string, secret: string, redaction: RedactionState): string {
  if (!secret || !contents.includes(secret)) {
    return contents
  }

  redaction.applied = true
  return contents.replaceAll(secret, REDACTED_VALUE)
}

function redactValue<T>(value: T, secret: string, redaction: RedactionState, seen = new WeakMap<object, unknown>()): T {
  if (typeof value === 'string') {
    return redactExactSecret(value, secret, redaction) as T
  }
  if (typeof value !== 'object' || value === null) {
    return value
  }

  const existing = seen.get(value)
  if (existing !== undefined) {
    return existing as T
  }

  if (Array.isArray(value)) {
    const result: Array<unknown> = []
    seen.set(value, result)
    for (const item of value) {
      result.push(redactValue(item, secret, redaction, seen))
    }
    return result as T
  }

  const result: Record<string, unknown> = {}
  seen.set(value, result)
  for (const [key, item] of Object.entries(value)) {
    result[key] = redactValue(item, secret, redaction, seen)
  }
  return result as T
}

function createArtifactRedactor(secret: string, redaction: RedactionState): NonNullable<DownloadOptions['transform']> {
  const secretBuffer = Buffer.from(secret)
  return contents => {
    const redacted = redactBuffer(contents, secretBuffer)
    if (redacted !== contents) {
      redaction.applied = true
    }
    return redacted
  }
}

function redactBuffer(contents: Buffer, secret: Buffer): Buffer {
  const firstMatch = contents.indexOf(secret)
  if (secret.length === 0 || firstMatch === -1) {
    return contents
  }

  const replacement = Buffer.from(REDACTED_VALUE)
  const chunks: Array<Buffer> = []
  let offset = 0
  let match = firstMatch
  while (match !== -1) {
    chunks.push(contents.subarray(offset, match), replacement)
    offset = match + secret.length
    match = contents.indexOf(secret, offset)
  }
  chunks.push(contents.subarray(offset))
  return Buffer.concat(chunks)
}

function shouldIgnoreDownloadedArtifact(name: string): boolean {
  const segments = name.split(/[\\/]/)
  return segments.some(segment => ['node_modules', '.git', '.next', '.turbo', 'dist'].includes(segment))
}

function shouldIgnoreCredentialArtifact(name: string): boolean {
  return CREDENTIAL_FILENAMES.has(path.posix.basename(name).toLowerCase())
}

async function runWithGracePeriod(operation: () => Promise<void>, graceMs: number, description: string): Promise<void> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${description} did not finish within ${graceMs}ms`))
    }, graceMs)
  })

  try {
    await Promise.race([operation(), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export {
  TrialAgentSchema,
  TrialArtifactsSchema,
  TrialChecksSchema,
  TrialExecutionError,
  TrialJudgesSchema,
  TrialWalkthroughSchema,
  runTrial,
  RunTrialResultSchema,
  TrialTimeoutError,
  validateTrialExecutionOptions,
}
export type {RunTrialResult, TrialExecutionOptions}
