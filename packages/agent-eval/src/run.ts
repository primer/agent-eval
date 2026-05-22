import {randomUUID} from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import {AGENTS_DIR, CONTAINER_WORKDIR, COPILOT_DIR, NODE_USER, Sandbox} from '@primer/agent-sandbox'
import type {Treatment, TreatmentResult} from './treatment'
import {parseMessage, type Message} from './copilot-cli'
import {parseTestResults} from './vitest'

type RunOptions = {
  artifactsDirectory: string
  copilotToken: string
  maxConcurrency?: number
  onEvent?: (event: RunEvent) => void
}

type RunEvent =
  | {
      type: 'progress'
      completed: number
      remaining: number
      running: number
      total: number
    }
  | {
      type: 'log'
      level: 'info' | 'error'
      message: string
      treatment?: Treatment
    }
  | {
      type: 'output'
      chunk: string
      stream: 'stdout' | 'stderr'
      treatment: Treatment
    }

function run(treatments: Array<Treatment>, options: RunOptions): Promise<Array<TreatmentResult>> {
  const maxConcurrency = options.maxConcurrency ?? 1
  const queue = treatments.slice()
  const results: Array<TreatmentResult> = []
  const pending = new Set<Promise<void>>()
  const total = treatments.length
  let completed = 0
  let cancelled = false

  function emitProgress() {
    options.onEvent?.({
      type: 'progress',
      completed,
      running: pending.size,
      remaining: total - completed - pending.size,
      total,
    })
  }

  let resolve: (value: Array<TreatmentResult>) => void
  let reject: (reason: unknown) => void
  const deferred = new Promise<Array<TreatmentResult>>((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })

  function execute() {
    if (cancelled) {
      return
    }

    if (queue.length === 0) {
      if (pending.size === 0) {
        emitProgress()
        resolve(results)
      }
      return
    }

    if (pending.size >= maxConcurrency) {
      return
    }

    const treatment = queue.shift()
    if (!treatment) {
      return
    }

    const promise = retry(
      () =>
        runTreatment(treatment, {
          artifactsDirectory: options.artifactsDirectory,
          copilotToken: options.copilotToken,
          onEvent: options.onEvent,
        }),
      3,
      options.onEvent,
      treatment,
    ).then(
      result => {
        results.push(result)
        pending.delete(promise)
        completed += 1
        emitProgress()
        execute()
      },
      error => {
        cancelled = true
        pending.delete(promise)
        options.onEvent?.({
          type: 'log',
          level: 'error',
          treatment,
          message: `Treatment failed: ${formatError(error)}`,
        })
        reject(error)
      },
    )

    pending.add(promise)
    emitProgress()
    execute()
  }

  execute()

  return deferred
}

async function retry<T>(
  fn: () => Promise<T>,
  retries: number,
  onEvent: RunOptions['onEvent'],
  treatment: Treatment,
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (retries > 0) {
      onEvent?.({
        type: 'log',
        level: 'error',
        treatment,
        message: `Retrying after error: ${formatError(error)}`,
      })
      return retry(fn, retries - 1, onEvent, treatment)
    }
    throw error
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

type RunTreatmentOptions = {
  artifactsDirectory: string
  copilotToken: string
  onEvent?: (event: RunEvent) => void
}

async function runTreatment(
  treatment: Treatment,
  {artifactsDirectory, copilotToken, onEvent}: RunTreatmentOptions,
): Promise<TreatmentResult> {
  const artifactDirectory = path.join(artifactsDirectory, treatment.id)
  const stderrLogPath = path.join(artifactDirectory, 'stderr.log')
  const stdoutLogPath = path.join(artifactDirectory, 'stdout.log')
  let stderrLog = ''
  let stdoutLog = ''

  function emitLog(level: 'info' | 'error', message: string) {
    onEvent?.({
      type: 'log',
      level,
      message,
      treatment,
    })
  }

  const onOutput = (event: {chunk: string; stream: 'stdout' | 'stderr'}) => {
    if (event.stream === 'stdout') {
      stdoutLog += event.chunk
    } else {
      stderrLog += event.chunk
    }

    onEvent?.({
      type: 'output',
      treatment,
      stream: event.stream,
      chunk: event.chunk,
    })
  }

  await fs.mkdir(artifactDirectory, {recursive: true})

  try {
    emitLog('info', `Running treatment: ${treatment.config.name} (${treatment.id})`)
    await using sandbox = await Sandbox.create({
      onOutput,
    })

    emitLog('info', `Copying files from: ${treatment.eval.directory}...`)
    await sandbox.copy(treatment.eval.directory, CONTAINER_WORKDIR, {
      exclude: ['eval.config.ts', 'eval.test.ts', 'node_modules', '.next'],
    })
    await sandbox.runCommand('chown', ['-R', NODE_USER, '.'], {
      user: 'root',
    })

    emitLog('info', 'Obfuscating package name...')
    await sandbox.runCommand('npm', ['pkg', 'set', `name=${treatment.id}`], {
      user: NODE_USER,
    })

    emitLog('info', 'Removing workspace dependency...')
    await sandbox.runCommand('npm', ['pkg', 'delete', 'devDependencies.@primer/agent-eval'], {
      user: NODE_USER,
    })

    emitLog('info', 'Installing dependencies...')
    await sandbox.runCommand('npm', ['install'], {
      user: NODE_USER,
    })

    emitLog('info', 'Running treatment setup...')
    await treatment.config.setup?.({
      sandbox,
    })

    emitLog('info', 'Run build script...')
    await sandbox.runCommand('npm', ['run', 'build', '--if-present'], {
      user: NODE_USER,
    })

    emitLog('info', 'Running copilot...')
    const {prompt} = treatment.eval.config
    const args = [
      '-p',
      prompt,
      '--model',
      treatment.model,
      '--allow-all',
      '--reasoning-effort',
      'high',
      '--mode',
      'autopilot',
      '--output-format',
      'json',
    ]
    const copilotOutput = await sandbox.runCommand('copilot', args, {
      user: NODE_USER,
      env: {
        COPILOT_GITHUB_TOKEN: copilotToken,
      },
    })
    const messages: Array<Message> = copilotOutput.stdout.split('\n').flatMap(line => {
      const trimmed = line.trim()
      if (trimmed.length === 0) {
        return []
      }
      const result = parseMessage(JSON.parse(trimmed))
      if (result.success) {
        return result.data
      }
      emitLog('error', `Failed to parse copilot message: ${line}`)
      return []
    })

    const TEST_PATH = 'eval.test.ts'
    await sandbox.copy(treatment.eval.testPath, TEST_PATH)
    // Always pass vitest calls even if test suite fails
    await sandbox.runCommand(
      'sh',
      ['-c', 'npx vitest run "$1" --reporter json --outputFile test-results.json || true', 'vitest-run', TEST_PATH],
      {
        user: NODE_USER,
      },
    )

    const testResultsContent = await sandbox.readFile('test-results.json')
    const testResults = parseTestResults(JSON.parse(testResultsContent))
    if (!testResults.success) {
      emitLog('error', `Failed to parse test results: ${testResults.error}`)
      throw new Error(`Failed to parse test results: ${testResults.error}`)
    }

    // Turns
    const assistantTurns = new Set<string>()
    // Tools
    const toolCalls = new Map<string, number>()
    let outputTokens = 0

    for (const message of messages) {
      if (message.type === 'assistant.turn_start') {
        assistantTurns.add(message.data.turnId)
      }

      if (message.type === 'assistant.message') {
        outputTokens += message.data.outputTokens
      }

      if (message.type === 'tool.execution_start') {
        const toolName = message.data.toolName
        toolCalls.set(toolName, (toolCalls.get(toolName) ?? 0) + 1)
      }
    }

    const result = messages.find((message): message is Extract<Message, {type: 'result'}> => {
      return message.type === 'result'
    })
    if (!result) {
      emitLog('error', 'No result message found in copilot output')
      throw new Error('No result message found in copilot output')
    }

    const workspacePath = path.join(artifactDirectory, 'workspace')
    const copilotConfigPath = path.join(artifactDirectory, '.copilot')
    const skillsConfigPath = path.join(artifactDirectory, '.agents')
    const testResultsPath = path.join(workspacePath, 'test-results.json')
    await fs.mkdir(workspacePath, {recursive: true})

    emitLog('info', `Downloading agent workspace to: ${workspacePath}...`)
    await sandbox.download(CONTAINER_WORKDIR, workspacePath, {
      ignore(name) {
        return name.includes('node_modules') || name.includes('.next')
      },
    })

    emitLog('info', `Downloading copilot config to: ${copilotConfigPath}...`)
    await sandbox.download(COPILOT_DIR, copilotConfigPath)

    emitLog('info', `Downloading skills config to: ${skillsConfigPath}...`)
    await sandbox.download(AGENTS_DIR, skillsConfigPath)

    return {
      id: randomUUID(),
      treatment,
      artifacts: {
        directory: artifactDirectory,
        copilotConfigPath,
        stderrLogPath,
        stdoutLogPath,
        skillsConfigPath,
        testResultsPath,
        workspacePath,
      },
      assistant: {
        turns: assistantTurns.size,
        outputTokens,
        premiumRequests: result.usage.premiumRequests,
        // Time to complete (latency)
        totalApiDurationMs: result.usage.totalApiDurationMs,
        sessionDurationMs: result.usage.sessionDurationMs,
        tools: Object.fromEntries(toolCalls),
      },
      testResults: {
        numFailedTests: testResults.data.numFailedTests,
        numPassedTests: testResults.data.numPassedTests,
        numPendingTests: testResults.data.numPendingTests,
        numTodoTests: testResults.data.numTodoTests,
        numTotalTests: testResults.data.numTotalTests,
      },
    }
  } finally {
    await Promise.all([fs.writeFile(stderrLogPath, stderrLog), fs.writeFile(stdoutLogPath, stdoutLog)])
  }
}

export {run}
