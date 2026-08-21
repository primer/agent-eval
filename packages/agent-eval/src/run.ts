import {randomUUID} from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import {AGENTS_DIR, CONTAINER_WORKDIR, COPILOT_DIR, NODE_USER, Sandbox} from './sandbox'
import type {Treatment, TreatmentResult} from './treatment'
import type {Model, ReasoningEffort} from './model'
import {isMessageType, parseMessage, type Message} from './copilot-cli'
import {getTestMetadata, parseTestResults} from './vitest'

const PLAYWRIGHT_BROWSERS_PATH = '/ms-playwright'

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
  sessionId,
}: {
  prompt: string
  model: Model
  reasoningEffort?: ReasoningEffort
  sessionId?: string
}): Array<string> {
  const args = ['-p', prompt, '--model', model, '--allow-all']

  if (reasoningEffort) {
    args.push('--reasoning-effort', reasoningEffort)
  }

  if (sessionId) {
    args.push('--resume', sessionId)
  }

  return [...args, '--mode', 'autopilot', '--output-format', 'json']
}

async function runTreatment(
  treatment: Treatment,
  {artifactsDirectory, copilotToken, dockerImage}: RunTreatmentOptions,
): Promise<TreatmentResult> {
  console.log('Running treatment: %s (%s)', treatment.config.name, treatment.id)
  await using sandbox = await Sandbox.create({dockerImage})

  const scenarioTestPaths = treatment.scenario.turns?.flatMap(turn => [
    path.relative(treatment.scenario.directory, turn.testPath),
    ...(turn.browserTestPath ? [path.relative(treatment.scenario.directory, turn.browserTestPath)] : []),
  ])
  console.log('Copying files from: %s...', treatment.scenario.directory)
  await sandbox.copy(treatment.scenario.directory, CONTAINER_WORKDIR, {
    exclude: [
      'scenario.config.ts',
      'scenario.test.ts',
      'scenario.browser.test.ts',
      ...(scenarioTestPaths ?? []),
      'node_modules',
      '.next',
    ],
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

  if (treatment.scenario.browserTestPath || treatment.scenario.turns?.some(turn => turn.browserTestPath)) {
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

  const scenarioTurns = [
    {
      prompt: treatment.scenario.config.prompt,
      testPath: treatment.scenario.testPath,
      ...(treatment.scenario.browserTestPath ? {browserTestPath: treatment.scenario.browserTestPath} : {}),
    },
    ...(treatment.scenario.turns ?? []),
  ]
  const VITEST_CONFIG_PATH = 'vitest.agent-eval.config.ts'
  const TEST_RESULTS_PATH = 'test-results.json'
  const messages: Array<Message> = []
  let numFailedTests = 0
  let numPassedTests = 0
  let numPendingTests = 0
  let numTodoTests = 0
  let numTotalTests = 0
  let testRunSuccess = true
  const tests: TreatmentResult['testResults']['tests'] = []
  const rawTestResults: Array<Record<string, unknown> & {testResults: Array<unknown>}> = []
  let sessionId: string | undefined

  for (const [turnIndex, turn] of scenarioTurns.entries()) {
    console.log('Running copilot turn %d of %d...', turnIndex + 1, scenarioTurns.length)
    const args = getCopilotArgs({
      prompt: turn.prompt,
      model: treatment.model,
      reasoningEffort: treatment.reasoningEffort,
      sessionId,
    })
    const copilotOutput = await sandbox.runCommand('copilot', args, {
      user: NODE_USER,
      env: {
        COPILOT_GITHUB_TOKEN: copilotToken,
      },
    })
    const turnMessages: Array<Message> = copilotOutput.stdout.split('\n').flatMap(line => {
      const trimmed = line.trim()
      if (trimmed.length === 0) {
        return []
      }
      return parseMessage(JSON.parse(trimmed))
    })
    messages.push(...turnMessages)

    const result = turnMessages.find(message => isMessageType(message, 'result'))
    if (!result) {
      throw new Error(`No result message found in copilot output for turn ${turnIndex + 1}`)
    }
    sessionId = result.sessionId

    const scenarioTests = [
      {
        sourcePath: turn.testPath,
        testPath: `scenario.turn-${turnIndex + 1}.test.ts`,
        resultsPath: `test-results.turn-${turnIndex + 1}.json`,
        browser: false,
      },
      ...(turn.browserTestPath
        ? [
            {
              sourcePath: turn.browserTestPath,
              testPath: `scenario.turn-${turnIndex + 1}.browser.test.ts`,
              resultsPath: `browser-test-results.turn-${turnIndex + 1}.json`,
              browser: true,
            },
          ]
        : []),
    ]

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

      await sandbox.runCommand('rm', ['-f', scenarioTest.testPath, scenarioTest.resultsPath], {
        user: NODE_USER,
      })
    }

    await sandbox.runCommand('rm', ['-f', VITEST_CONFIG_PATH], {user: NODE_USER})
    if (!testRunSuccess) {
      break
    }
  }

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

  const results = messages.filter(message => isMessageType(message, 'result'))

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
      premiumRequests: results.reduce((total, result) => total + result.usage.premiumRequests, 0),
      // Time to complete (latency)
      totalApiDurationMs: results.reduce((total, result) => total + result.usage.totalApiDurationMs, 0),
      sessionDurationMs: results.reduce((total, result) => total + result.usage.sessionDurationMs, 0),
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

export {getCopilotArgs, getVitestConfig, run}
