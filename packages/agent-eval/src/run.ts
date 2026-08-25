import {randomUUID} from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import {AGENTS_DIR, CONTAINER_WORKDIR, COPILOT_DIR, NODE_USER, NPM_GLOBAL_DIR, Sandbox} from './sandbox'
import type {Treatment, TreatmentResult} from './treatment'
import type {CopilotRunner} from './experiment-config'
import type {Model, ReasoningEffort} from './model'
import {isMessageType, parseMessage, type Message} from './copilot-cli'
import {getTestMetadata, parseTestResults} from './vitest'

const PLAYWRIGHT_BROWSERS_PATH = '/ms-playwright'
const COPILOT_SDK_VERSION = '1.0.11'
const COPILOT_SDK_RUNNER_PATH = '/tmp/agent-eval-copilot-sdk-runner.cjs'
const COPILOT_SDK_RUNNER_CONFIG_PATH = '/tmp/agent-eval-copilot-sdk-runner-config.json'
const NPM_GLOBAL_NODE_MODULES = path.posix.join(NPM_GLOBAL_DIR, 'lib/node_modules')

type RunOptions = {
  artifactsDirectory: string
  copilotToken: string
  dockerImage?: string
  maxConcurrency?: number
}

function getVitestConfig(outputFile: string, browser = false): string {
  const browserImport = browser ? `import {playwright} from '@vitest/browser-playwright'\n` : ''
  const browserConfig = browser
    ? `    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{browser: 'chromium'}],
    },
`
    : ''

  return `
import {defineConfig} from 'vitest/config'
${browserImport}
export default defineConfig({
  test: {
${browserConfig}    reporters: [['json', {outputFile: ${JSON.stringify(outputFile)}, includeTaskLocation: true}]],
  },
})
`
}

function run(treatments: Array<Treatment>, options: RunOptions): Promise<Array<TreatmentResult>> {
  const maxConcurrency = options.maxConcurrency ?? 1
  const queue = treatments.slice()
  const results: Array<TreatmentResult> = []
  const pending = new Set()
  let cancelled = false

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
          dockerImage: options.dockerImage,
        }),
      3,
    ).then(
      result => {
        results.push(result)
        pending.delete(promise)
        execute()
      },
      error => {
        cancelled = true
        pending.delete(promise)
        reject(error)
      },
    )

    pending.add(promise)
    execute()
  }

  execute()

  return deferred
}

async function retry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (retries > 0) {
      console.log('Retrying after error: %s', error)
      return retry(fn, retries - 1)
    }
    throw error
  }
}

type RunTreatmentOptions = {
  artifactsDirectory: string
  copilotToken: string
  dockerImage?: string
}

function getCopilotArgs({
  prompt,
  model,
  reasoningEffort,
}: {
  prompt: string
  model: Model
  reasoningEffort?: ReasoningEffort
}): Array<string> {
  const args = ['-p', prompt, '--model', model, '--allow-all']

  if (reasoningEffort) {
    args.push('--reasoning-effort', reasoningEffort)
  }

  return [...args, '--mode', 'autopilot', '--output-format', 'json']
}

function normalizeCopilotMessage(message: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    ...message,
    parentId: message.parentId ?? '',
  }
  const data = (typeof normalized.data === 'object' && normalized.data !== null ? normalized.data : {}) as Record<
    string,
    unknown
  >

  switch (normalized.type) {
    case 'user.message':
      normalized.data = {
        content: '',
        transformedContent: '',
        attachments: [],
        supportedNativeDocumentMimeTypes: [],
        agentMode: '',
        interactionId: '',
        parentAgentTaskId: '',
        ...data,
      }
      break
    case 'assistant.message':
      normalized.data = {
        toolRequests: [],
        interactionId: '',
        turnId: '',
        requestId: '',
        ...data,
      }
      break
    case 'assistant.turn_start':
      normalized.data = {
        interactionId: '',
        ...data,
      }
      break
    case 'assistant.tool_call_delta':
      normalized.data = {
        toolName: '',
        ...data,
      }
      break
    case 'tool.execution_start':
      normalized.data = {
        arguments: {},
        turnId: '',
        model: '',
        ...data,
      }
      break
    case 'tool.execution_complete':
      normalized.data = data.success
        ? {
            interactionId: '',
            turnId: '',
            model: '',
            result: {
              content: '',
              detailedContent: '',
              ...((typeof data.result === 'object' && data.result !== null ? data.result : {}) as Record<
                string,
                unknown
              >),
            },
            toolTelemetry: {},
            ...data,
          }
        : {
            interactionId: '',
            turnId: '',
            model: '',
            error: {
              message: '',
              code: '',
              ...((typeof data.error === 'object' && data.error !== null ? data.error : {}) as Record<string, unknown>),
            },
            toolTelemetry: {},
            ...data,
          }
      break
    case 'session.task_complete':
      normalized.data = {
        summary: '',
        success: false,
        ...data,
      }
      break
  }

  return normalized
}

function parseCopilotOutput(output: string): Array<Message> {
  return output.split('\n').flatMap(line => {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      return []
    }
    return parseMessage(normalizeCopilotMessage(JSON.parse(trimmed)))
  })
}

function getCopilotSdkRunnerScript(): string {
  return `
const fs = require('node:fs/promises')
const {CopilotClient, approveAll} = require('@github/copilot-sdk')

function normalizeEvent(event) {
  return {
    ...event,
    parentId: event.parentId ?? '',
  }
}

function emit(event) {
  console.log(JSON.stringify(normalizeEvent(event)))
}

async function main() {
  const config = JSON.parse(await fs.readFile(process.argv[2], 'utf8'))
  const startedAt = Date.now()
  let sessionId = ''
  let totalApiDurationMs = 0
  let codeChanges = {
    linesAdded: 0,
    linesRemoved: 0,
    filesModified: [],
  }

  const client = new CopilotClient({
    workingDirectory: process.cwd(),
    baseDirectory: config.copilotHome,
    gitHubToken: process.env.COPILOT_GITHUB_TOKEN,
    useLoggedInUser: false,
    logLevel: 'none',
  })

  await client.start()
  try {
    const sessionConfig = {
      model: config.model,
      onPermissionRequest: approveAll,
    }

    if (config.reasoningEffort) {
      sessionConfig.reasoningEffort = config.reasoningEffort
    }

    const session = await client.createSession(sessionConfig)
    sessionId = session.sessionId
    session.on(event => {
      if (event.type === 'assistant.usage') {
        totalApiDurationMs += event.data.duration ?? 0
      }

      if (event.type === 'session.shutdown') {
        totalApiDurationMs = event.data.totalApiDurationMs ?? totalApiDurationMs
        codeChanges = event.data.codeChanges ?? codeChanges
      }

      emit(event)
    })

    await session.sendAndWait({
      prompt: config.prompt,
      agentMode: 'autopilot',
    }, config.timeoutMs)
    await session.disconnect()
  } finally {
    const errors = await client.stop()
    if (errors.length > 0) {
      throw new Error(errors.map(error => error.message).join('\\n'))
    }
  }

  emit({
    type: 'result',
    timestamp: new Date().toISOString(),
    sessionId,
    exitCode: 0,
    usage: {
      premiumRequests: 0,
      totalApiDurationMs,
      sessionDurationMs: Date.now() - startedAt,
      codeChanges,
    },
  })
}

main().catch(error => {
  console.error(error?.stack ?? String(error))
  process.exit(1)
})
`
}

async function runCopilotSdk({
  sandbox,
  prompt,
  model,
  reasoningEffort,
  copilotToken,
}: {
  sandbox: Sandbox
  prompt: string
  model: Model
  reasoningEffort?: ReasoningEffort
  copilotToken: string
}): Promise<Array<Message>> {
  console.log('Installing copilot sdk...')
  await sandbox.runCommand('npm', ['install', '-g', `@github/copilot-sdk@${COPILOT_SDK_VERSION}`], {
    user: NODE_USER,
  })
  await sandbox.writeFile(COPILOT_SDK_RUNNER_PATH, getCopilotSdkRunnerScript())
  await sandbox.writeFile(
    COPILOT_SDK_RUNNER_CONFIG_PATH,
    JSON.stringify({
      copilotHome: COPILOT_DIR,
      model,
      prompt,
      reasoningEffort,
      timeoutMs: 60 * 60 * 1000,
    }),
  )
  const copilotOutput = await sandbox.runCommand('node', [COPILOT_SDK_RUNNER_PATH, COPILOT_SDK_RUNNER_CONFIG_PATH], {
    user: NODE_USER,
    env: {
      COPILOT_GITHUB_TOKEN: copilotToken,
      NODE_PATH: NPM_GLOBAL_NODE_MODULES,
    },
  })

  return parseCopilotOutput(copilotOutput.stdout)
}

async function runCopilotCli({
  sandbox,
  prompt,
  model,
  reasoningEffort,
  copilotToken,
}: {
  sandbox: Sandbox
  prompt: string
  model: Model
  reasoningEffort?: ReasoningEffort
  copilotToken: string
}): Promise<Array<Message>> {
  const args = getCopilotArgs({
    prompt,
    model,
    reasoningEffort,
  })
  const copilotOutput = await sandbox.runCommand('copilot', args, {
    user: NODE_USER,
    env: {
      COPILOT_GITHUB_TOKEN: copilotToken,
    },
  })

  return parseCopilotOutput(copilotOutput.stdout)
}

async function runCopilot(
  runner: CopilotRunner,
  options: {
    sandbox: Sandbox
    prompt: string
    model: Model
    reasoningEffort?: ReasoningEffort
    copilotToken: string
  },
): Promise<Array<Message>> {
  switch (runner) {
    case 'copilot-cli':
      return runCopilotCli(options)
    case 'copilot-sdk':
      return runCopilotSdk(options)
  }
}

async function runTreatment(
  treatment: Treatment,
  {artifactsDirectory, copilotToken, dockerImage}: RunTreatmentOptions,
): Promise<TreatmentResult> {
  console.log('Running treatment: %s (%s)', treatment.config.name, treatment.id)
  await using sandbox = await Sandbox.create({dockerImage})

  console.log('Copying files from: %s...', treatment.scenario.directory)
  await sandbox.copy(treatment.scenario.directory, CONTAINER_WORKDIR, {
    exclude: ['scenario.config.ts', 'scenario.test.ts', 'scenario.browser.test.ts', 'node_modules', '.next'],
  })
  await sandbox.runCommand('chown', ['-R', NODE_USER, '.'], {
    user: 'root',
  })

  console.log('Obfuscating package name...')
  await sandbox.runCommand('npm', ['pkg', 'set', `name=${treatment.id}`], {
    user: NODE_USER,
  })

  console.log('Removing workspace dependency...')
  await sandbox.runCommand('npm', ['pkg', 'delete', 'devDependencies.@primer/agent-eval'], {
    user: NODE_USER,
  })

  console.log('Installing dependencies...')
  await sandbox.runCommand('npm', ['install'], {
    user: NODE_USER,
  })

  if (treatment.experiment.setup) {
    console.log('Running experiment setup...')
    await treatment.experiment.setup({
      sandbox,
    })
  }

  if (treatment.config.setup) {
    console.log('Running treatment setup...')
    await treatment.config.setup({
      sandbox,
    })
  }

  console.log('Run build script...')
  await sandbox.runCommand('npm', ['run', 'build', '--if-present'], {
    user: NODE_USER,
  })

  if (treatment.scenario.browserTestPath) {
    console.log('Installing browser test dependencies...')
    await sandbox.runCommand(
      'npm',
      ['install', '--no-save', '--package-lock=false', 'vitest', 'playwright', '@vitest/browser-playwright'],
      {
        user: NODE_USER,
      },
    )
    console.log('Installing Playwright browser...')
    await sandbox.runCommand('./node_modules/.bin/playwright', ['install', '--with-deps', 'chromium'], {
      user: 'root',
      env: {
        PLAYWRIGHT_BROWSERS_PATH,
      },
    })
  }

  console.log('Running copilot...')
  const {prompt} = treatment.scenario.config
  const messages = await runCopilot(treatment.runner, {
    sandbox,
    prompt,
    model: treatment.model,
    reasoningEffort: treatment.reasoningEffort,
    copilotToken,
  })

  const TEST_PATH = 'scenario.test.ts'
  const BROWSER_TEST_PATH = 'scenario.browser.test.ts'
  const VITEST_CONFIG_PATH = 'vitest.agent-eval.config.ts'
  const TEST_RESULTS_PATH = 'test-results.json'
  const BROWSER_TEST_RESULTS_PATH = 'browser-test-results.json'
  const scenarioTests = [
    {
      sourcePath: treatment.scenario.testPath,
      testPath: TEST_PATH,
      resultsPath: TEST_RESULTS_PATH,
      browser: false,
    },
  ]

  if (treatment.scenario.browserTestPath) {
    scenarioTests.push({
      sourcePath: treatment.scenario.browserTestPath,
      testPath: BROWSER_TEST_PATH,
      resultsPath: BROWSER_TEST_RESULTS_PATH,
      browser: true,
    })
  }

  let numFailedTests = 0
  let numPassedTests = 0
  let numPendingTests = 0
  let numTodoTests = 0
  let numTotalTests = 0
  let testRunSuccess = true
  const tests: TreatmentResult['testResults']['tests'] = []
  const rawTestResults: Array<Record<string, unknown> & {testResults: Array<unknown>}> = []

  for (const scenarioTest of scenarioTests) {
    await sandbox.copy(scenarioTest.sourcePath, scenarioTest.testPath)
    await sandbox.writeFile(VITEST_CONFIG_PATH, getVitestConfig(scenarioTest.resultsPath, scenarioTest.browser))
    // Always pass vitest calls even if test suite fails
    await sandbox.runCommand(
      'sh',
      ['-c', 'npx vitest run --config "$1" "$2" || true', 'vitest-run', VITEST_CONFIG_PATH, scenarioTest.testPath],
      {
        user: NODE_USER,
        env: scenarioTest.browser ? {PLAYWRIGHT_BROWSERS_PATH} : undefined,
      },
    )

    const testResultsContent = await sandbox.readFile(scenarioTest.resultsPath)
    const rawTestResult: unknown = JSON.parse(testResultsContent)
    const testResults = parseTestResults(rawTestResult)
    if (!testResults.success) {
      throw new Error(`Failed to parse test results: ${testResults.error}`)
    }

    const testSource = await fs.readFile(scenarioTest.sourcePath, 'utf8')
    numFailedTests += testResults.data.numFailedTests
    numPassedTests += testResults.data.numPassedTests
    numPendingTests += testResults.data.numPendingTests
    numTodoTests += testResults.data.numTodoTests
    numTotalTests += testResults.data.numTotalTests
    testRunSuccess &&= testResults.data.success
    tests.push(...getTestMetadata(testResults.data, testSource))
    rawTestResults.push(rawTestResult as Record<string, unknown> & {testResults: Array<unknown>})
  }

  if (rawTestResults.length > 1) {
    await sandbox.writeFile(
      TEST_RESULTS_PATH,
      JSON.stringify({
        ...rawTestResults[0],
        numFailedTests,
        numPassedTests,
        numPendingTests,
        numTodoTests,
        numTotalTests,
        success: testRunSuccess,
        testResults: rawTestResults.flatMap(testResult => testResult.testResults),
      }),
    )
  }

  // Turns
  const assistantTurns = new Set()
  // Tools
  const toolCalls = new Map()
  let outputTokens = 0

  for (const message of messages) {
    if (isMessageType(message, 'assistant.turn_start')) {
      assistantTurns.add(message.data.turnId)
    }

    if (isMessageType(message, 'assistant.message')) {
      outputTokens += message.data.outputTokens ?? 0
    }

    if (isMessageType(message, 'tool.execution_start')) {
      const toolName = message.data.toolName
      toolCalls.set(toolName, (toolCalls.get(toolName) ?? 0) + 1)
    }
  }

  const result = messages.find(message => isMessageType(message, 'result'))
  if (!result) {
    throw new Error('No result message found in copilot output')
  }

  const artifactDirectory = path.join(artifactsDirectory, treatment.id)
  const workspacePath = path.join(artifactDirectory, 'workspace')
  const copilotConfigPath = path.join(artifactDirectory, '.copilot')
  const skillsConfigPath = path.join(artifactDirectory, '.agents')
  const testResultsPath = path.join(workspacePath, 'test-results.json')
  await fs.mkdir(workspacePath, {recursive: true})

  console.log('Downloading agent workspace to: %s...', workspacePath)
  await sandbox.download(CONTAINER_WORKDIR, workspacePath, {
    ignore(name) {
      return name.includes('node_modules') || name.includes('.next')
    },
  })

  console.log('Downloading copilot config to: %s...', copilotConfigPath)
  await sandbox.download(COPILOT_DIR, copilotConfigPath)

  console.log('Downloading skills config to: %s...', skillsConfigPath)
  await sandbox.download(AGENTS_DIR, skillsConfigPath)

  return {
    id: randomUUID(),
    treatment,
    artifacts: {
      directory: artifactDirectory,
      copilotConfigPath,
      skillsConfigPath,
      testResultsPath,
      workspacePath,
    },
    assistant: {
      logs: messages,
      turns: assistantTurns.size,
      outputTokens,
      premiumRequests: result.usage.premiumRequests,
      // Time to complete (latency)
      totalApiDurationMs: result.usage.totalApiDurationMs,
      sessionDurationMs: result.usage.sessionDurationMs,
      tools: Object.fromEntries(toolCalls),
    },
    testResults: {
      numFailedTests,
      numPassedTests,
      numPendingTests,
      numTodoTests,
      numTotalTests,
      tests,
    },
  }
}

export {getCopilotArgs, getCopilotSdkRunnerScript, getVitestConfig, normalizeCopilotMessage, run}
