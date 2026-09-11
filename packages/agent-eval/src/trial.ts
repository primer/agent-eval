import path from 'node:path'
import {isMessageType, MessageSchema, parseMessage, type Message, type ResultMessage} from './copilot-cli'
import {DefaultHost, type Host} from './host'
import {
  AGENTS_DIR,
  CONTAINER_WORKDIR,
  COPILOT_DIR,
  NODE_USER,
  SKILLS_DIR,
  type DownloadOptions,
  type Sandbox,
} from './sandbox'
import {parseTestResults, TestResultsSchema} from './vitest'
import {logger} from './logger'
import * as z from 'zod/mini'
import {ModelVariantSchema} from './model'
import {ScenarioSchema} from './scenario'
import {TreatmentSchema, TreatmentSetupSchema} from './treatment'
import {
  getJudgeFiles,
  getJudgeModel,
  getJudgePrompt,
  getJudgeReportFilename,
  JudgeOutputSchema,
  parseJudgeReport,
  type JudgeOutput,
  type JudgeResult,
} from './judge'

const TrialSchema = z.object({
  id: z.string(),
  scenario: ScenarioSchema,
  treatment: TreatmentSchema,
  model: ModelVariantSchema,
  setup: z.optional(TreatmentSetupSchema),
})

type Trial = z.infer<typeof TrialSchema>

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg'])
const AGENT_BROWSER_SKILL_DIRECTORY = path.posix.join(SKILLS_DIR, 'agent-browser')
const PLAYWRIGHT_BROWSERS_PATH = '/ms-playwright'
const VITEST_VERSION = '4.1.11'
const CANDIDATE_RUNTIME_ARTIFACTS_DIR = '/tmp/agent-eval-candidate'
const CANDIDATE_LOG_DIR = path.posix.join(CANDIDATE_RUNTIME_ARTIFACTS_DIR, 'logs')
const CANDIDATE_USAGE_PATH = path.posix.join(CANDIDATE_RUNTIME_ARTIFACTS_DIR, 'usage.json')
const TIMEOUT_ARTIFACT_CAPTURE_GRACE_MS = 1_000
const REDACTED_VALUE = '[REDACTED]'
const CREDENTIAL_FILENAMES = new Set([
  'auth.json',
  'credentials.json',
  'hosts.json',
  'oauth.json',
  'token.json',
  'tokens.json',
])

const WalkthroughSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('Unavailable')}),
  z.object({type: z.literal('Screenshot'), filepath: z.string()}),
  z.object({type: z.literal('Screenshots'), screenshots: z.array(z.string())}),
  z.object({type: z.literal('Video'), filepath: z.string()}),
])

type Walkthrough = z.infer<typeof WalkthroughSchema>

const AgentSessionSchema = z.object({
  turns: z.number(),
  outputTokens: z.number(),
  premiumRequests: z.number(),
  totalApiDurationMs: z.number(),
  sessionDurationMs: z.number(),
  tools: z.record(z.string(), z.number()),
  messages: z.array(MessageSchema),
})

type AgentSession = z.infer<typeof AgentSessionSchema>

const TrialArtifactsSchema = z.object({
  directory: z.string(),
  copilotConfigDirectory: z.string(),
  skillsConfigDirectory: z.string(),
  testResultsPath: z.string(),
  workspaceDirectory: z.string(),
  attemptsDirectory: z.optional(z.string()),
  candidateLogsDirectory: z.optional(z.string()),
  candidateSessionPath: z.optional(z.string()),
  candidateStderrPath: z.optional(z.string()),
  candidateStdoutPath: z.optional(z.string()),
  candidateUsagePath: z.optional(z.string()),
  candidateWorkspaceDirectory: z.optional(z.string()),
  redactionApplied: z.optional(z.boolean()),
  redactionPath: z.optional(z.string()),
})

const TrialAgentSchema = z.object({
  sessions: z.array(AgentSessionSchema),
})

const TrialResultSchema = z.object({
  artifacts: TrialArtifactsSchema,
  trial: TrialSchema,
  agent: TrialAgentSchema,
  judges: z.array(JudgeOutputSchema),
  testResults: TestResultsSchema,
  walkthrough: WalkthroughSchema,
})

type TrialResult = z.infer<typeof TrialResultSchema>

type PortableTrialPaths = Pick<TrialResult, 'artifacts' | 'walkthrough'>

type ResultFileOptions = {
  host?: Host
}

type RedactionState = {
  applied: boolean
}

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
   * Soft AI-credit limit for the evaluated candidate Copilot session.
   * This does not include the optional walkthrough session. Actual credit usage
   * must be read from the raw candidate usage artifact when available, not
   * inferred from AgentSession.premiumRequests.
   */
  maxAiCredits?: number
  /**
   * Maximum wall-clock duration for the complete trial.
   */
  timeoutMs?: number
}

type TrialAttemptOptions = {
  maxRetries: number
  number: number
}

type RunTrialOptions = {
  artifactsDirectory: string
  attempt?: TrialAttemptOptions
  copilotToken: string
  execution?: TrialExecutionOptions
  host?: Host
  sandbox: Sandbox
  trial: Trial
}

type TrialPhase = 'setup' | 'candidate' | 'candidate-output' | 'tests' | 'judges' | 'walkthrough' | 'artifacts'
type TrialFailureKind = 'candidate-exit' | 'invalid-output' | 'timeout' | 'execution'

type TrialFailure = {
  artifacts: {
    attemptDirectory: string
    candidateLogsDirectory?: string
    candidateSessionPath?: string
    candidateStderrPath: string
    candidateStdoutPath: string
    candidateUsagePath?: string
    candidateWorkspaceDirectory: string
    directory: string
    failurePath: string
    redactionPath: string
  }
  attempt: number
  artifactCaptureErrors?: Array<string>
  candidateExitCode?: number
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

class TrialExecutionError extends Error {
  failure: TrialFailure

  constructor(failure: TrialFailure) {
    super(
      `Trial "${failure.trialId}" failed during ${failure.phase} (${failure.kind}); evidence: ${failure.artifacts.failurePath}`,
    )
    this.name = 'TrialExecutionError'
    this.failure = failure
  }
}

class TrialTimeoutError extends Error {
  constructor(timeoutMs: number, options?: ErrorOptions) {
    super(`Trial timed out after ${timeoutMs}ms`, options)
    this.name = 'TrialTimeoutError'
  }
}

class CandidateExitError extends Error {
  exitCode: number

  constructor(exitCode: number) {
    super(`Candidate Copilot process exited with code ${exitCode}`)
    this.name = 'CandidateExitError'
    this.exitCode = exitCode
  }
}

type TrialArtifactPaths = {
  artifactDirectory: string
  attemptsDirectory: string
  attemptDirectory: string
  attemptPath: string
  candidateLogsDirectory: string
  candidateStderrPath: string
  candidateSessionPath: string
  candidateStdoutPath: string
  candidateUsagePath: string
  candidateWorkspaceDirectory: string
  copilotConfigDirectory: string
  failurePath: string
  redactionPath: string
  resultPath: string
  skillsConfigDirectory: string
  testResultsPath: string
  walkthroughPath: string
  workspaceDirectory: string
}

function resolvePathWithinDirectory(directory: string, filepath: string, description: string): string {
  const normalizedFilepath = filepath.split(path.win32.sep).join(path.posix.sep)
  if (path.posix.isAbsolute(normalizedFilepath) || path.win32.isAbsolute(filepath)) {
    throw new Error(`${description} "${filepath}" must be relative to the output directory`)
  }

  const resolvedDirectory = path.resolve(directory)
  const resolvedFilepath = path.resolve(resolvedDirectory, ...normalizedFilepath.split(path.posix.sep))
  const relativePath = path.relative(resolvedDirectory, resolvedFilepath)
  if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    throw new Error(`${description} "${filepath}" must be within the output directory`)
  }

  return resolvedFilepath
}

function isWithinDirectory(directory: string, filepath: string): boolean {
  const relativePath = path.relative(directory, filepath)
  return relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath)
}

async function resolveExistingPathWithinDirectory(
  host: Host,
  directory: string,
  filepath: string,
  description: string,
): Promise<string> {
  const resolvedFilepath = resolvePathWithinDirectory(directory, filepath, description)
  const [realDirectory, realFilepath] = await Promise.all([
    host.fs.realpath(directory),
    host.fs.realpath(resolvedFilepath),
  ])
  if (!isWithinDirectory(realDirectory, realFilepath)) {
    throw new Error(`${description} "${filepath}" must not resolve outside the output directory`)
  }

  return realFilepath
}

async function preparePathWithinDirectory(
  host: Host,
  directory: string,
  filepath: string,
  description: string,
): Promise<string> {
  const resolvedFilepath = resolvePathWithinDirectory(directory, filepath, description)
  const realDirectory = await host.fs.realpath(directory)
  let existingDirectory = path.dirname(resolvedFilepath)

  while (true) {
    try {
      const realExistingDirectory = await host.fs.realpath(existingDirectory)
      if (!isWithinDirectory(realDirectory, realExistingDirectory)) {
        throw new Error(`${description} "${filepath}" must not resolve outside the output directory`)
      }
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      existingDirectory = path.dirname(existingDirectory)
    }
  }

  const parentDirectory = path.dirname(resolvedFilepath)
  await host.fs.mkdir(parentDirectory, {recursive: true})
  const realParentDirectory = await host.fs.realpath(parentDirectory)
  if (!isWithinDirectory(realDirectory, realParentDirectory)) {
    throw new Error(`${description} "${filepath}" must not resolve outside the output directory`)
  }

  try {
    const stats = await host.fs.lstat(resolvedFilepath)
    if (stats.isSymbolicLink()) {
      throw new Error(`${description} "${filepath}" must not be a symbolic link`)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }

  return resolvedFilepath
}

async function writeTrialFiles<T extends {artifacts: {directory: string}; id: string}>(
  outputPath: string,
  trials: Map<string, T>,
  options: ResultFileOptions = {},
): Promise<Record<string, string>> {
  const host = options.host ?? DefaultHost
  const outputDirectory = path.dirname(outputPath)
  await host.fs.mkdir(outputDirectory, {recursive: true})
  const entries = await Promise.all(
    [...trials].map(async ([trialId, trial]) => {
      if (trial.id !== trialId) {
        throw new Error(`Trial map key "${trialId}" does not match trial id "${trial.id}"`)
      }

      const artifactDirectory = path.isAbsolute(trial.artifacts.directory)
        ? trial.artifacts.directory
        : path.resolve(outputDirectory, trial.artifacts.directory)
      const trialFilePath = await preparePathWithinDirectory(
        host,
        outputDirectory,
        path.relative(outputDirectory, path.join(artifactDirectory, `${trialId}.json`)),
        `Trial file for "${trialId}"`,
      )
      await host.fs.writeFile(trialFilePath, JSON.stringify(trial), 'utf-8')
      const reference = path.relative(outputDirectory, trialFilePath).split(path.sep).join(path.posix.sep)
      return [trialId, reference] as const
    }),
  )

  return Object.fromEntries(entries)
}

async function readTrialFiles<T>(
  outputPath: string,
  references: Record<string, string>,
  parse: (input: unknown) => T,
  options: ResultFileOptions = {},
): Promise<Map<string, T>> {
  const host = options.host ?? DefaultHost
  const outputDirectory = path.dirname(outputPath)
  const entries = await Promise.all(
    Object.entries(references).map(async ([trialId, reference]) => {
      const trialFilePath = await resolveExistingPathWithinDirectory(
        host,
        outputDirectory,
        reference,
        `Trial reference for "${trialId}"`,
      )
      const contents = await host.fs.readFile(trialFilePath, 'utf-8')
      const trial = parse(JSON.parse(contents))
      if (
        typeof trial !== 'object' ||
        trial === null ||
        !('id' in trial) ||
        typeof trial.id !== 'string' ||
        trial.id !== trialId
      ) {
        throw new Error(`Trial file "${reference}" does not contain trial id "${trialId}"`)
      }

      return [trialId, trial] as const
    }),
  )

  return new Map(entries)
}

function getPortableTrialPaths(result: TrialResult, baseDirectory: string): PortableTrialPaths {
  const toPortablePath = (filepath: string): string => {
    if (!path.isAbsolute(filepath)) {
      return filepath.split(path.sep).join(path.posix.sep)
    }

    return path.relative(baseDirectory, filepath).split(path.sep).join(path.posix.sep)
  }

  let walkthrough: Walkthrough
  if (result.walkthrough.type === 'Screenshots') {
    walkthrough = {
      type: 'Screenshots',
      screenshots: result.walkthrough.screenshots.map(toPortablePath),
    }
  } else if (result.walkthrough.type === 'Screenshot' || result.walkthrough.type === 'Video') {
    walkthrough = {
      ...result.walkthrough,
      filepath: toPortablePath(result.walkthrough.filepath),
    }
  } else {
    walkthrough = result.walkthrough
  }

  return {
    artifacts: {
      directory: toPortablePath(result.artifacts.directory),
      ...(result.artifacts.attemptsDirectory
        ? {attemptsDirectory: toPortablePath(result.artifacts.attemptsDirectory)}
        : {}),
      ...(result.artifacts.candidateLogsDirectory
        ? {candidateLogsDirectory: toPortablePath(result.artifacts.candidateLogsDirectory)}
        : {}),
      ...(result.artifacts.candidateSessionPath
        ? {candidateSessionPath: toPortablePath(result.artifacts.candidateSessionPath)}
        : {}),
      ...(result.artifacts.candidateStderrPath
        ? {candidateStderrPath: toPortablePath(result.artifacts.candidateStderrPath)}
        : {}),
      ...(result.artifacts.candidateStdoutPath
        ? {candidateStdoutPath: toPortablePath(result.artifacts.candidateStdoutPath)}
        : {}),
      ...(result.artifacts.candidateUsagePath
        ? {candidateUsagePath: toPortablePath(result.artifacts.candidateUsagePath)}
        : {}),
      ...(result.artifacts.candidateWorkspaceDirectory
        ? {candidateWorkspaceDirectory: toPortablePath(result.artifacts.candidateWorkspaceDirectory)}
        : {}),
      copilotConfigDirectory: toPortablePath(result.artifacts.copilotConfigDirectory),
      ...(result.artifacts.redactionApplied !== undefined ? {redactionApplied: result.artifacts.redactionApplied} : {}),
      ...(result.artifacts.redactionPath ? {redactionPath: toPortablePath(result.artifacts.redactionPath)} : {}),
      skillsConfigDirectory: toPortablePath(result.artifacts.skillsConfigDirectory),
      testResultsPath: toPortablePath(result.artifacts.testResultsPath),
      workspaceDirectory: toPortablePath(result.artifacts.workspaceDirectory),
    },
    walkthrough,
  }
}

async function validateJudgeFileSource(host: Host, sourcePath: string): Promise<void> {
  const stats = await host.fs.lstat(sourcePath)
  if (stats.isSymbolicLink()) {
    throw new Error(`Judge reference must not contain symbolic links: ${sourcePath}`)
  }
  if (stats.isDirectory()) {
    for (const entry of await host.fs.readdir(sourcePath)) {
      await validateJudgeFileSource(host, path.join(sourcePath, entry))
    }
  } else if (!stats.isFile()) {
    throw new Error(`Judge reference must be a file or directory: ${sourcePath}`)
  }
}

async function getJudgeFileSources(host: Host, trial: Trial): Promise<Array<{filepath: string; sourcePath: string}>> {
  const files = [...new Set(trial.scenario.judges.flatMap(getJudgeFiles))]
  if (files.length === 0) {
    return []
  }

  const directory = await host.fs.realpath(trial.scenario.directory)
  const sources: Array<{filepath: string; sourcePath: string}> = []
  for (const filepath of files) {
    const sourcePath = path.join(directory, filepath)
    if (!host.existsSync(sourcePath)) {
      throw new Error(`Judge reference "${filepath}" was not found in scenario "${trial.scenario.id}"`)
    }
    if ((await host.fs.realpath(sourcePath)) !== sourcePath) {
      throw new Error(`Judge reference must not use symbolic links: ${filepath}`)
    }
    await validateJudgeFileSource(host, sourcePath)
    if (
      files.some(parent => {
        return filepath.startsWith(`${parent}/`)
      })
    ) {
      continue
    }
    sources.push({filepath, sourcePath})
  }
  return sources
}

async function run(options: RunTrialOptions): Promise<TrialResult> {
  const host = options.host ?? DefaultHost
  const execution = validateTrialExecutionOptions(options.execution)
  const attempt = validateTrialAttemptOptions(options.attempt)
  const judgeFiles = await getJudgeFileSources(host, options.trial)
  const artifactPaths = getTrialArtifactPaths(options.artifactsDirectory, options.trial.id, attempt.number)
  const startedAt = new Date().toISOString()
  const state: {phase: TrialPhase} = {
    phase: 'setup',
  }
  let candidateOutput: {
    exitCode?: number
    stderr: string
    stdout: string
  } = {
    stderr: '',
    stdout: '',
  }
  const artifactCaptureErrors: Array<string> = []
  const redaction: RedactionState = {
    applied: false,
  }

  if (attempt.number === 1 && host.existsSync(artifactPaths.artifactDirectory)) {
    await host.fs.rm(artifactPaths.artifactDirectory, {recursive: true, force: true})
  }
  await host.fs.mkdir(artifactPaths.attemptDirectory, {recursive: true})
  await writeRedactionDiagnostic(host, artifactPaths.redactionPath, redaction)
  await writeAttemptRecord(host, artifactPaths.attemptPath, {
    attempt: attempt.number,
    maxRetries: attempt.maxRetries,
    startedAt,
    status: 'running',
    trialId: options.trial.id,
  })

  try {
    const result = await withTrialTimeout(
      () => {
        return executeTrial({
          artifactPaths,
          copilotToken: options.copilotToken,
          execution,
          host,
          judgeFiles,
          redaction,
          onCandidateOutput(output) {
            candidateOutput = output
          },
          onArtifactCaptureErrors(errors) {
            artifactCaptureErrors.push(...errors)
          },
          onPhase(nextPhase) {
            state.phase = nextPhase
          },
          sandbox: options.sandbox,
          trial: options.trial,
        })
      },
      execution.timeoutMs,
      options.sandbox,
      async () => {
        artifactCaptureErrors.push(
          ...(await captureCandidateRuntimeArtifacts(
            options.sandbox,
            host,
            artifactPaths,
            options.copilotToken,
            redaction,
          )),
        )
      },
    )

    await writeCandidateOutput(host, artifactPaths, candidateOutput, options.copilotToken, redaction)
    const safeResult = redactValue(result, options.copilotToken, redaction)
    safeResult.artifacts.redactionApplied = redaction.applied
    await host.fs.writeFile(artifactPaths.resultPath, JSON.stringify(safeResult), 'utf-8')
    await writeRedactionDiagnostic(host, artifactPaths.redactionPath, redaction)
    await writeAttemptRecord(host, artifactPaths.attemptPath, {
      attempt: attempt.number,
      completedAt: new Date().toISOString(),
      maxRetries: attempt.maxRetries,
      redactionApplied: redaction.applied,
      startedAt,
      status: 'succeeded',
      trialId: options.trial.id,
    })
    return safeResult
  } catch (error) {
    await writeCandidateOutput(host, artifactPaths, candidateOutput, options.copilotToken, redaction)
    const runtimeArtifactCaptureErrors =
      error instanceof TrialTimeoutError
        ? []
        : await captureCandidateRuntimeArtifacts(options.sandbox, host, artifactPaths, options.copilotToken, redaction)
    const failureArtifactCaptureErrors =
      error instanceof TrialTimeoutError
        ? []
        : await captureFailureArtifacts(
            options.sandbox,
            host,
            artifactPaths,
            options.copilotToken,
            redaction,
            judgeFiles.map(file => file.filepath),
          )
    const safeError = getSafeError(error, options.copilotToken, redaction)
    await writeRedactionDiagnostic(host, artifactPaths.redactionPath, redaction)
    const failure: TrialFailure = {
      artifacts: {
        attemptDirectory: artifactPaths.attemptDirectory,
        candidateStderrPath: artifactPaths.candidateStderrPath,
        candidateStdoutPath: artifactPaths.candidateStdoutPath,
        candidateWorkspaceDirectory: artifactPaths.candidateWorkspaceDirectory,
        directory: artifactPaths.artifactDirectory,
        failurePath: artifactPaths.failurePath,
        redactionPath: artifactPaths.redactionPath,
        ...(host.existsSync(artifactPaths.candidateLogsDirectory)
          ? {candidateLogsDirectory: artifactPaths.candidateLogsDirectory}
          : {}),
        ...(host.existsSync(artifactPaths.candidateSessionPath)
          ? {candidateSessionPath: artifactPaths.candidateSessionPath}
          : {}),
        ...(host.existsSync(artifactPaths.candidateUsagePath)
          ? {candidateUsagePath: artifactPaths.candidateUsagePath}
          : {}),
      },
      attempt: attempt.number,
      candidateExitCode: error instanceof CandidateExitError ? error.exitCode : candidateOutput.exitCode,
      completedAt: new Date().toISOString(),
      error: safeError,
      kind:
        error instanceof TrialTimeoutError
          ? 'timeout'
          : error instanceof CandidateExitError
            ? 'candidate-exit'
            : state.phase === 'candidate-output'
              ? 'invalid-output'
              : 'execution',
      maxRetries: attempt.maxRetries,
      phase: state.phase,
      redactionApplied: redaction.applied,
      startedAt,
      status: 'failed',
      trialId: options.trial.id,
      ...([...artifactCaptureErrors, ...runtimeArtifactCaptureErrors, ...failureArtifactCaptureErrors].length > 0
        ? {
            artifactCaptureErrors: [
              ...artifactCaptureErrors,
              ...runtimeArtifactCaptureErrors,
              ...failureArtifactCaptureErrors,
            ],
          }
        : {}),
    }
    await host.fs.writeFile(artifactPaths.failurePath, JSON.stringify(failure, null, 2), 'utf-8')
    await writeAttemptRecord(host, artifactPaths.attemptPath, failure)
    throw new TrialExecutionError(failure)
  }
}

function validateTrialExecutionOptions(
  execution: TrialExecutionOptions = {},
): Required<Pick<TrialExecutionOptions, 'captureWalkthrough' | 'installDependencies'>> & TrialExecutionOptions {
  if (
    execution.maxAiCredits !== undefined &&
    (!Number.isFinite(execution.maxAiCredits) ||
      !Number.isInteger(execution.maxAiCredits) ||
      execution.maxAiCredits < 30 ||
      !Number.isSafeInteger(execution.maxAiCredits))
  ) {
    throw new Error('maxAiCredits must be a finite integer greater than or equal to 30')
  }

  if (
    execution.timeoutMs !== undefined &&
    (!Number.isFinite(execution.timeoutMs) ||
      !Number.isInteger(execution.timeoutMs) ||
      execution.timeoutMs < 1 ||
      !Number.isSafeInteger(execution.timeoutMs))
  ) {
    throw new Error('timeoutMs must be a finite positive integer')
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

function validateTrialAttemptOptions(attempt: TrialAttemptOptions | undefined): TrialAttemptOptions {
  const normalized = attempt ?? {
    maxRetries: 0,
    number: 1,
  }
  if (!Number.isSafeInteger(normalized.number) || normalized.number < 1) {
    throw new Error('attempt.number must be a positive integer')
  }
  if (!Number.isSafeInteger(normalized.maxRetries) || normalized.maxRetries < 0) {
    throw new Error('attempt.maxRetries must be a non-negative integer')
  }
  return normalized
}

function getTrialArtifactPaths(artifactsDirectory: string, trialId: string, attempt: number): TrialArtifactPaths {
  const artifactDirectory = path.join(artifactsDirectory, trialId)
  const attemptsDirectory = path.join(artifactDirectory, 'attempts')
  const attemptDirectory = path.join(attemptsDirectory, String(attempt))
  const workspaceDirectory = path.join(artifactDirectory, 'workspace')

  return {
    artifactDirectory,
    attemptsDirectory,
    attemptDirectory,
    attemptPath: path.join(attemptDirectory, 'attempt.json'),
    candidateLogsDirectory: path.join(attemptDirectory, 'candidate-logs'),
    candidateSessionPath: path.join(attemptDirectory, 'candidate-session.json'),
    candidateStderrPath: path.join(attemptDirectory, 'candidate.stderr.log'),
    candidateStdoutPath: path.join(attemptDirectory, 'candidate.stdout.log'),
    candidateUsagePath: path.join(attemptDirectory, 'candidate-usage.json'),
    candidateWorkspaceDirectory: path.join(attemptDirectory, 'candidate-workspace'),
    copilotConfigDirectory: path.join(artifactDirectory, '.copilot'),
    failurePath: path.join(attemptDirectory, 'failure.json'),
    redactionPath: path.join(attemptDirectory, 'redaction.json'),
    resultPath: path.join(attemptDirectory, 'result.json'),
    skillsConfigDirectory: path.join(artifactDirectory, '.agents'),
    testResultsPath: path.join(workspaceDirectory, 'test-results.json'),
    walkthroughPath: path.join(artifactDirectory, 'walkthrough'),
    workspaceDirectory,
  }
}

async function withTrialTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number | undefined,
  sandbox: Sandbox,
  captureArtifacts: () => Promise<void>,
): Promise<T> {
  if (timeoutMs === undefined) {
    return operation()
  }

  let timer: NodeJS.Timeout | undefined
  let timedOut = false
  const pending = new Promise<never>(() => {})
  const operationPromise = operation().then(
    result => {
      return timedOut ? pending : result
    },
    error => {
      if (timedOut) {
        return pending
      }
      throw error
    },
  )
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true
      void (async () => {
        const timeoutError = new TrialTimeoutError(timeoutMs)
        let captureError: unknown
        try {
          await runWithGracePeriod(captureArtifacts, TIMEOUT_ARTIFACT_CAPTURE_GRACE_MS)
        } catch (error) {
          captureError = error
        }

        try {
          await sandbox[Symbol.asyncDispose]()
        } catch (disposalError) {
          reject(
            new TrialTimeoutError(timeoutMs, {
              cause: captureError
                ? new AggregateError([captureError, disposalError], 'Artifact capture and sandbox disposal failed')
                : disposalError,
            }),
          )
          return
        }

        reject(captureError ? new TrialTimeoutError(timeoutMs, {cause: captureError}) : timeoutError)
      })()
    }, timeoutMs)
  })

  try {
    return await Promise.race([operationPromise, timeout])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

async function runWithGracePeriod(operation: () => Promise<void>, graceMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined
  const gracePeriod = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Artifact capture did not finish within ${graceMs}ms`))
    }, graceMs)
  })

  try {
    await Promise.race([operation(), gracePeriod])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

async function writeCandidateOutput(
  host: Host,
  artifactPaths: TrialArtifactPaths,
  output: {stderr: string; stdout: string},
  secret: string,
  redaction: RedactionState,
): Promise<{stderr: string; stdout: string}> {
  const stdout = redactExactSecret(output.stdout, secret, redaction)
  const stderr = redactExactSecret(output.stderr, secret, redaction)
  await Promise.all([
    host.fs.writeFile(artifactPaths.candidateStdoutPath, stdout, 'utf-8'),
    host.fs.writeFile(artifactPaths.candidateStderrPath, stderr, 'utf-8'),
  ])
  return {
    stderr,
    stdout,
  }
}

async function captureCandidateWorkspace(
  sandbox: Sandbox,
  host: Host,
  candidateWorkspaceDirectory: string,
  secret: string,
  redaction: RedactionState,
): Promise<void> {
  await host.fs.rm(candidateWorkspaceDirectory, {recursive: true, force: true})
  await sandbox.download(CONTAINER_WORKDIR, candidateWorkspaceDirectory, {
    ignore: shouldIgnoreDownloadedArtifact,
    transform: createArtifactRedactor(secret, redaction),
  })
}

async function captureCandidateRuntimeArtifacts(
  sandbox: Sandbox,
  host: Host,
  artifactPaths: TrialArtifactPaths,
  secret: string,
  redaction: RedactionState,
): Promise<Array<string>> {
  const errors: Array<string> = []

  try {
    if (await sandbox.exists(CANDIDATE_USAGE_PATH)) {
      const usage = await sandbox.readFile(CANDIDATE_USAGE_PATH)
      await writeRedactedFile(host, artifactPaths.candidateUsagePath, usage, secret, redaction)
    }
  } catch (error) {
    errors.push(`Usage artifact: ${getSafeError(error, secret, redaction).message}`)
  }

  try {
    if (await sandbox.exists(CANDIDATE_LOG_DIR)) {
      await host.fs.rm(artifactPaths.candidateLogsDirectory, {recursive: true, force: true})
      await sandbox.download(CANDIDATE_LOG_DIR, artifactPaths.candidateLogsDirectory, {
        transform: createArtifactRedactor(secret, redaction),
      })
    }
  } catch (error) {
    errors.push(`Log artifacts: ${getSafeError(error, secret, redaction).message}`)
  }

  return errors
}

async function captureFinalArtifacts(
  sandbox: Sandbox,
  host: Host,
  artifactPaths: TrialArtifactPaths,
  secret: string,
  redaction: RedactionState,
  preservedPaths: Array<string> = [],
): Promise<void> {
  await Promise.all([
    host.fs.rm(artifactPaths.workspaceDirectory, {recursive: true, force: true}),
    host.fs.rm(artifactPaths.copilotConfigDirectory, {recursive: true, force: true}),
    host.fs.rm(artifactPaths.skillsConfigDirectory, {recursive: true, force: true}),
  ])
  await host.fs.mkdir(artifactPaths.workspaceDirectory, {recursive: true})

  await sandbox.download(CONTAINER_WORKDIR, artifactPaths.workspaceDirectory, {
    ignore(name) {
      return shouldIgnoreDownloadedArtifact(name, preservedPaths)
    },
    transform: createArtifactRedactor(secret, redaction),
  })
  await sandbox.download(COPILOT_DIR, artifactPaths.copilotConfigDirectory, {
    ignore: shouldIgnoreCredentialArtifact,
    transform: createArtifactRedactor(secret, redaction),
  })
  await sandbox.download(AGENTS_DIR, artifactPaths.skillsConfigDirectory, {
    transform: createArtifactRedactor(secret, redaction),
  })
}

async function captureFailureArtifacts(
  sandbox: Sandbox,
  host: Host,
  artifactPaths: TrialArtifactPaths,
  secret: string,
  redaction: RedactionState,
  preservedPaths: Array<string> = [],
): Promise<Array<string>> {
  try {
    await captureFinalArtifacts(sandbox, host, artifactPaths, secret, redaction, preservedPaths)
    return []
  } catch (error) {
    return [getSafeError(error, secret, redaction).message]
  }
}

function shouldIgnoreDownloadedArtifact(name: string, preservedPaths: Array<string> = []): boolean {
  const normalized = name.split(path.sep).join(path.posix.sep)
  if (
    preservedPaths.some(filepath => {
      return normalized === filepath || normalized.startsWith(`${filepath}/`) || filepath.startsWith(`${normalized}/`)
    })
  ) {
    return false
  }
  return name.includes('node_modules') || name.includes('.next') || name.includes('.turbo') || name.includes('dist')
}

async function writeAttemptRecord(host: Host, filepath: string, record: object): Promise<void> {
  await host.fs.writeFile(filepath, JSON.stringify(record, null, 2), 'utf-8')
}

function getSafeError(error: unknown, secret?: string, redaction?: RedactionState): {message: string; name: string} {
  const name = error instanceof Error ? error.name : 'Error'
  const rawMessage = error instanceof Error ? error.message : String(error)
  const message = secret && redaction ? redactExactSecret(rawMessage, secret, redaction) : rawMessage
  return {
    message,
    name,
  }
}

function redactExactSecret(contents: string, secret: string, redaction: RedactionState): string {
  if (!secret || !contents.includes(secret)) {
    return contents
  }

  redaction.applied = true
  return contents.replaceAll(secret, REDACTED_VALUE)
}

async function writeRedactedFile(
  host: Host,
  filepath: string,
  contents: string,
  secret: string,
  redaction: RedactionState,
): Promise<void> {
  await host.fs.writeFile(filepath, redactExactSecret(contents, secret, redaction), 'utf-8')
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

function shouldIgnoreCredentialArtifact(name: string): boolean {
  return CREDENTIAL_FILENAMES.has(path.posix.basename(name).toLowerCase())
}

async function writeRedactionDiagnostic(host: Host, filepath: string, redaction: RedactionState): Promise<void> {
  await host.fs.writeFile(
    filepath,
    JSON.stringify(
      {
        redactionApplied: redaction.applied,
      },
      null,
      2,
    ),
    'utf-8',
  )
}

async function executeTrial({
  artifactPaths,
  copilotToken,
  execution,
  host = DefaultHost,
  judgeFiles,
  onArtifactCaptureErrors,
  onCandidateOutput,
  onPhase,
  redaction,
  sandbox,
  trial,
}: {
  artifactPaths: TrialArtifactPaths
  copilotToken: string
  execution: Required<Pick<TrialExecutionOptions, 'captureWalkthrough' | 'installDependencies'>> & TrialExecutionOptions
  host?: Host
  judgeFiles: Array<{filepath: string; sourcePath: string}>
  onArtifactCaptureErrors: (errors: Array<string>) => void
  onCandidateOutput: (output: {exitCode?: number; stderr: string; stdout: string}) => void
  onPhase: (phase: TrialPhase) => void
  redaction: RedactionState
  sandbox: Sandbox
  trial: Trial
}): Promise<TrialResult> {
  const logPrefix = `[${trial.scenario.id}] [${trial.treatment.name}] [${trial.model.name} (${trial.model.reasoningEffort})]`

  logger.info('%s Running trial: %s', logPrefix, trial.id)

  onPhase('setup')
  logger.info('%s Copying files from: %s...', logPrefix, trial.scenario.directory)

  await sandbox.copy(trial.scenario.directory, CONTAINER_WORKDIR, {
    exclude: [
      'scenario.config.ts',
      'scenario.test.ts',
      'browser.test.ts',
      'scenario.browser.test.ts',
      'node_modules',
      '.next',
      'dist',
      ...judgeFiles.map(file => {
        return file.filepath
      }),
    ],
  })
  await sandbox.runCommand('chown', ['-R', NODE_USER, '.'], {
    user: 'root',
  })

  logger.info('%s Obfuscating package name...', logPrefix)
  await sandbox.runCommand('npm', ['pkg', 'set', `name=${trial.id}`], {
    user: NODE_USER,
  })

  logger.info('%s Removing workspace dependency...', logPrefix)
  await sandbox.runCommand('npm', ['pkg', 'delete', 'devDependencies.@primer/agent-eval'], {
    user: NODE_USER,
  })

  if (execution.installDependencies) {
    logger.info('%s Installing dependencies...', logPrefix)
    await sandbox.runCommand('npm', ['install'], {
      user: NODE_USER,
    })
  }

  if (trial.setup) {
    logger.info('%s Running generic setup...', logPrefix)
    await trial.setup({
      sandbox,
    })
  }

  if (trial.treatment.setup) {
    logger.info('%s Running treatment setup...', logPrefix)
    await trial.treatment.setup({
      sandbox,
    })
  }

  logger.info('%s Run build script...', logPrefix)
  await sandbox.runCommand('npm', ['run', 'build', '--if-present'], {
    user: NODE_USER,
  })

  if (trial.scenario.browserTestPath) {
    logger.info('%s Installing browser test dependencies...', logPrefix)
    await sandbox.runCommand(
      'npm',
      ['install', '--no-save', '--package-lock=false', 'vitest', 'playwright', '@vitest/browser-playwright'],
      {
        user: NODE_USER,
      },
    )
    logger.info('%s Installing Playwright browser...', logPrefix)
    await sandbox.runCommand('./node_modules/.bin/playwright', ['install', '--with-deps', 'chromium'], {
      user: 'root',
      env: {
        PLAYWRIGHT_BROWSERS_PATH,
      },
    })
  }

  onPhase('candidate')
  logger.info('%s Running copilot...', logPrefix)
  await sandbox.runCommand('mkdir', ['-p', CANDIDATE_LOG_DIR], {
    user: NODE_USER,
  })
  let streamedStdout = ''
  let streamedStderr = ''
  const candidateArgs = [
    '--prompt',
    trial.scenario.prompt,
    '--model',
    trial.model.name,
    '--reasoning-effort',
    trial.model.reasoningEffort,
    '--mode',
    'autopilot',
    '--allow-all',
    '--no-auto-update',
    '--usage-output-file',
    CANDIDATE_USAGE_PATH,
    '--log-dir',
    CANDIDATE_LOG_DIR,
    '--output-format',
    'json',
  ]
  if (execution.maxAiCredits !== undefined) {
    candidateArgs.push('--max-ai-credits', String(execution.maxAiCredits))
  }

  const copilotOutput = await sandbox.runCommand('copilot', candidateArgs, {
    user: NODE_USER,
    env: {
      COPILOT_GITHUB_TOKEN: copilotToken,
    },
    allowNonZeroExitCode: true,
    onStdout(chunk) {
      streamedStdout += chunk
      onCandidateOutput({
        stderr: streamedStderr,
        stdout: streamedStdout,
      })
    },
    onStderr(chunk) {
      streamedStderr += chunk
      onCandidateOutput({
        stderr: streamedStderr,
        stdout: streamedStdout,
      })
    },
  })
  onCandidateOutput(copilotOutput)
  const persistedCopilotOutput = await writeCandidateOutput(host, artifactPaths, copilotOutput, copilotToken, redaction)
  await captureCandidateWorkspace(sandbox, host, artifactPaths.candidateWorkspaceDirectory, copilotToken, redaction)
  const candidateArtifactErrors = await captureCandidateRuntimeArtifacts(
    sandbox,
    host,
    artifactPaths,
    copilotToken,
    redaction,
  )
  onArtifactCaptureErrors(candidateArtifactErrors)
  if (copilotOutput.exitCode !== 0) {
    throw new CandidateExitError(copilotOutput.exitCode)
  }
  if (candidateArtifactErrors.length > 0) {
    throw new Error(`Failed to capture candidate runtime artifacts: ${candidateArtifactErrors.join('; ')}`)
  }

  onPhase('candidate-output')
  const messages: Array<Message> = persistedCopilotOutput.stdout.split('\n').flatMap(line => {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      return []
    }
    return parseMessage(JSON.parse(trimmed))
  })
  const candidateResult = getResultMessage(messages)
  const candidateSession = getAgentSession(messages, candidateResult)
  await host.fs.writeFile(artifactPaths.candidateSessionPath, JSON.stringify(candidateSession), 'utf-8')
  if (candidateResult.exitCode !== 0) {
    throw new CandidateExitError(candidateResult.exitCode)
  }

  onPhase('tests')
  logger.info('%s Running tests...', logPrefix)

  if (!trial.scenario.browserTestPath) {
    logger.info('%s Installing test dependencies...', logPrefix)
    await sandbox.runCommand('npm', ['install', '--no-save', '--package-lock=false', `vitest@${VITEST_VERSION}`], {
      user: NODE_USER,
    })
  }

  const TEST_PATH = 'scenario.test.ts'
  const BROWSER_TEST_PATH = 'scenario.browser.test.ts'
  const VITEST_CONFIG_PATH = 'vitest.agent-eval.config.ts'
  const TEST_RESULTS_PATH = 'test-results.json'
  const BROWSER_TEST_RESULTS_PATH = 'browser-test-results.json'
  const scenarioTests = [
    {
      sourcePath: trial.scenario.testPath,
      testPath: TEST_PATH,
      resultsPath: TEST_RESULTS_PATH,
      browser: false,
    },
  ]

  if (trial.scenario.browserTestPath) {
    scenarioTests.push({
      sourcePath: trial.scenario.browserTestPath,
      testPath: BROWSER_TEST_PATH,
      resultsPath: BROWSER_TEST_RESULTS_PATH,
      browser: true,
    })
  }

  const testRuns: Array<z.infer<typeof TestResultsSchema>> = []
  for (const scenarioTest of scenarioTests) {
    await sandbox.copy(scenarioTest.sourcePath, scenarioTest.testPath)
    await sandbox.writeFile(VITEST_CONFIG_PATH, getVitestConfig(scenarioTest.resultsPath, scenarioTest.browser))
    await sandbox.runCommand(
      'sh',
      [
        '-c',
        './node_modules/.bin/vitest run --config "$1" "$2" || true',
        'vitest-run',
        VITEST_CONFIG_PATH,
        scenarioTest.testPath,
      ],
      {
        user: NODE_USER,
        env: scenarioTest.browser ? {PLAYWRIGHT_BROWSERS_PATH} : {},
      },
    )

    const testResultsContent = await sandbox.readFile(scenarioTest.resultsPath)
    const rawTestResult: unknown = JSON.parse(testResultsContent)
    const testResults = parseTestResults(rawTestResult)
    if (!testResults.success) {
      throw new Error(`Failed to parse test results: ${testResults.error}`)
    }

    testRuns.push(testResults.data)
  }

  const firstTestRun = testRuns[0]
  if (!firstTestRun) {
    throw new Error('No test results were collected')
  }

  const testResults =
    testRuns.length === 1
      ? firstTestRun
      : {
          ...firstTestRun,
          numFailedTests: testRuns.reduce((total, result) => total + result.numFailedTests, 0),
          numPassedTests: testRuns.reduce((total, result) => total + result.numPassedTests, 0),
          numPendingTests: testRuns.reduce((total, result) => total + result.numPendingTests, 0),
          numTodoTests: testRuns.reduce((total, result) => total + result.numTodoTests, 0),
          numTotalTests: testRuns.reduce((total, result) => total + result.numTotalTests, 0),
          success: testRuns.every(result => result.success),
          testResults: testRuns.flatMap(result => result.testResults),
        }

  if (testRuns.length > 1) {
    await sandbox.writeFile(TEST_RESULTS_PATH, JSON.stringify(testResults))
  }

  onPhase('judges')
  const judgeOutputs: Array<JudgeOutput> = []
  if (trial.scenario.judges.length > 0) {
    logger.info('%s Running judges...', logPrefix)

    for (const file of judgeFiles) {
      if (await sandbox.exists(file.filepath)) {
        throw new Error(`Cannot copy judge reference "${file.filepath}": the workspace path already exists`)
      }
    }
    for (const file of judgeFiles) {
      logger.info('%s Copying judge reference: %s...', logPrefix, file.filepath)
      await sandbox.copy(file.sourcePath, file.filepath)
    }
    if (judgeFiles.length > 0) {
      await sandbox.runCommand(
        'chown',
        [
          '-R',
          NODE_USER,
          '--',
          ...judgeFiles.map(file => {
            return file.filepath
          }),
        ],
        {user: 'root'},
      )
    }

    for (const judge of trial.scenario.judges) {
      logger.info('%s Running judge: %s...', logPrefix, judge.name)

      const model = getJudgeModel(judge, trial)
      const judgeCopilotOutput = await sandbox.runCommand(
        'copilot',
        [
          '--prompt',
          getJudgePrompt(judge),
          '--model',
          model.name,
          '--reasoning-effort',
          model.reasoningEffort,
          '--mode',
          'autopilot',
          '--allow-all',
          '--no-auto-update',
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
      const judgeMessages: Array<Message> = judgeCopilotOutput.stdout.split('\n').flatMap(line => {
        const trimmed = line.trim()
        if (trimmed.length === 0) {
          return []
        }
        return parseMessage(JSON.parse(trimmed))
      })
      const session = getAgentSession(judgeMessages)
      const judgeReportPath = getJudgeReportFilename(judge)
      let result: JudgeResult
      if (await sandbox.exists(judgeReportPath)) {
        result = parseJudgeReport(await sandbox.readFile(judgeReportPath), judge)
        if (result.type === 'error') {
          logger.warn('%s Judge "%s" report is invalid: %s', logPrefix, judge.name, result.message)
        }
      } else {
        logger.warn('%s Judge "%s" did not write its report: %s', logPrefix, judge.name, judgeReportPath)
        result = {type: 'unknown'}
      }
      judgeOutputs.push({
        config: judge,
        result,
        agent: {session},
      })
    }
  }

  const WALKTHROUGH_DIR = 'walkthrough'
  const WALKTHROUGH_VIEWPORT_WIDTH = 1440
  const WALKTHROUGH_VIEWPORT_HEIGHT = 900
  if (execution.captureWalkthrough) {
    onPhase('walkthrough')
    logger.debug('%s Capturing walkthrough...', logPrefix)
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
    const walkthroughResult = await sandbox.runCommand(
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
        '--no-auto-update',
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

    if (walkthroughResult.exitCode !== 0) {
      logger.warn('%s Unable to capture walkthrough: %s', logPrefix, walkthroughResult.stderr)
    }

    logger.debug('%s Removing walkthrough skill...', logPrefix)
    await sandbox.runCommand('rm', ['-rf', AGENT_BROWSER_SKILL_DIRECTORY], {
      user: NODE_USER,
    })
  }

  onPhase('artifacts')
  const {
    artifactDirectory,
    attemptsDirectory,
    candidateLogsDirectory,
    candidateSessionPath,
    candidateStderrPath,
    candidateStdoutPath,
    candidateUsagePath,
    candidateWorkspaceDirectory,
    copilotConfigDirectory,
    skillsConfigDirectory,
    testResultsPath,
    walkthroughPath,
    workspaceDirectory,
    redactionPath,
  } = artifactPaths

  logger.info('%s Downloading artifacts to: %s...', logPrefix, artifactDirectory)

  await captureFinalArtifacts(
    sandbox,
    host,
    artifactPaths,
    copilotToken,
    redaction,
    judgeFiles.map(file => file.filepath),
  )

  let walkthrough: Walkthrough = {
    type: 'Unavailable',
  }

  if (host.existsSync(path.join(workspaceDirectory, WALKTHROUGH_DIR))) {
    logger.debug(
      '%s Moving walkthrough artifacts from: %s to: %s...',
      logPrefix,
      path.join(workspaceDirectory, WALKTHROUGH_DIR),
      walkthroughPath,
    )
    await host.fs.rm(walkthroughPath, {recursive: true, force: true})
    await host.fs.mkdir(walkthroughPath, {recursive: true})
    await host.fs.rename(path.join(workspaceDirectory, WALKTHROUGH_DIR), walkthroughPath)

    if (host.existsSync(path.join(walkthroughPath, 'screenshot.png'))) {
      walkthrough = {
        type: 'Screenshot',
        filepath: path.join(walkthroughPath, 'screenshot.png'),
      }
    } else if (host.existsSync(path.join(walkthroughPath, 'walkthrough.webm'))) {
      walkthrough = {
        type: 'Video',
        filepath: path.join(walkthroughPath, 'walkthrough.webm'),
      }
    } else if (host.existsSync(path.join(walkthroughPath, 'screenshots'))) {
      const screenshotsDir = path.join(walkthroughPath, 'screenshots')
      const entries = await host.fs.readdir(screenshotsDir).then(filenames => {
        return filenames.toSorted((a, b) => a.localeCompare(b, undefined, {numeric: true}))
      })
      const screenshots = entries.filter(entry => {
        return IMAGE_EXTENSIONS.has(path.extname(entry).toLowerCase())
      })
      if (screenshots.length > 0) {
        walkthrough = {
          type: 'Screenshots',
          screenshots: screenshots.map(screenshot => path.join(screenshotsDir, screenshot)),
        }
      }
    }
  }

  return {
    artifacts: {
      directory: artifactDirectory,
      attemptsDirectory,
      candidateStderrPath,
      candidateStdoutPath,
      candidateWorkspaceDirectory,
      copilotConfigDirectory,
      redactionApplied: redaction.applied,
      redactionPath,
      skillsConfigDirectory,
      testResultsPath,
      workspaceDirectory,
      ...(host.existsSync(candidateLogsDirectory) ? {candidateLogsDirectory} : {}),
      ...(host.existsSync(candidateSessionPath) ? {candidateSessionPath} : {}),
      ...(host.existsSync(candidateUsagePath) ? {candidateUsagePath} : {}),
    },
    trial,
    agent: {
      sessions: [candidateSession],
    },
    judges: judgeOutputs,
    testResults,
    walkthrough,
  }
}

function getResultMessage(messages: Array<Message>): ResultMessage {
  const result = messages.find(message => isMessageType(message, 'result'))
  if (!result || !isMessageType(result, 'result')) {
    throw new Error('No result message found in copilot output')
  }
  return result
}

function getAgentSession(messages: Array<Message>, result = getResultMessage(messages)): AgentSession {
  const turns = new Set()
  const toolCalls = new Map()
  let assistantOutputTokens = 0
  let modelOutputTokens = 0
  let hasModelOutput = false

  for (const message of messages) {
    if (isMessageType(message, 'assistant.turn_start')) {
      turns.add(message.data.turnId)
    }

    if (isMessageType(message, 'assistant.message')) {
      assistantOutputTokens += message.data.outputTokens ?? 0
    }

    if (isMessageType(message, 'model.message') && message.data.message.role === 'assistant') {
      hasModelOutput = true
      modelOutputTokens += message.data.message.outputTokens ?? 0
    }

    if (isMessageType(message, 'tool.execution_start')) {
      const toolName = message.data.toolName
      toolCalls.set(toolName, (toolCalls.get(toolName) ?? 0) + 1)
    }
  }

  return {
    messages,
    outputTokens: hasModelOutput ? modelOutputTokens : assistantOutputTokens,
    premiumRequests: result.usage.premiumRequests,
    sessionDurationMs: result.usage.sessionDurationMs,
    tools: Object.fromEntries(toolCalls),
    totalApiDurationMs: result.usage.totalApiDurationMs,
    turns: turns.size,
  }
}

function getVitestConfig(outputFile: string, browser = false) {
  const browserImport = browser ? `import {playwright} from '@vitest/browser-playwright';\n` : ''
  const browserConfig = browser
    ? `    browser: {
      enabled: true,
      headless: true,
      instances: [
        {
          browser: 'chromium',
        },
      ],
      provider: playwright(),
    },
`
    : ''

  return `${browserImport}import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
${browserConfig}    include: ['**/*.test.ts'],
    reporters: [
      [
        'json',
        {
          outputFile: ${JSON.stringify(outputFile)},
          includeTaskLocation: true,
        },
      ],
    ],
  },
})`
}

type CompareTrialResult = Pick<TrialResult, 'testResults' | 'agent'>

/**
 * Compare to trial results to determine which treatment performed better. We
 * compare trials based on:
 *
 * - Test success rate (higher is better)
 * - Output tokens (lower is better)
 * - Total API duration (lower is better)
 * - Number of turns (lower is better)
 * - Number of premium requests (lower is better)
 */
function compare(a: CompareTrialResult, b: CompareTrialResult): number {
  const successRateA = a.testResults.numTotalTests > 0 ? a.testResults.numPassedTests / a.testResults.numTotalTests : 0
  const successRateB = b.testResults.numTotalTests > 0 ? b.testResults.numPassedTests / b.testResults.numTotalTests : 0

  const outputTokensA = a.agent.sessions.reduce((sum, session) => sum + session.outputTokens, 0)
  const outputTokensB = b.agent.sessions.reduce((sum, session) => sum + session.outputTokens, 0)

  const totalApiDurationA = a.agent.sessions.reduce((sum, session) => sum + session.totalApiDurationMs, 0)
  const totalApiDurationB = b.agent.sessions.reduce((sum, session) => sum + session.totalApiDurationMs, 0)

  const turnsA = a.agent.sessions.reduce((sum, session) => sum + session.turns, 0)
  const turnsB = b.agent.sessions.reduce((sum, session) => sum + session.turns, 0)

  const premiumRequestsA = a.agent.sessions.reduce((sum, session) => sum + session.premiumRequests, 0)
  const premiumRequestsB = b.agent.sessions.reduce((sum, session) => sum + session.premiumRequests, 0)

  return (
    successRateB - successRateA ||
    outputTokensA - outputTokensB ||
    totalApiDurationA - totalApiDurationB ||
    turnsA - turnsB ||
    premiumRequestsA - premiumRequestsB
  )
}

export {
  TrialSchema,
  TrialResultSchema,
  TrialArtifactsSchema,
  TrialAgentSchema,
  WalkthroughSchema,
  TrialExecutionError,
  run,
  compare,
  getPortableTrialPaths,
  readTrialFiles,
  validateTrialExecutionOptions,
  writeTrialFiles,
}
export type {
  ResultFileOptions,
  RunTrialOptions,
  Trial,
  TrialAttemptOptions,
  TrialExecutionOptions,
  TrialFailure,
  TrialFailureKind,
  TrialPhase,
  TrialResult,
}
