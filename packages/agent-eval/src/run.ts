import {randomUUID} from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import {AGENTS_DIR, CONTAINER_WORKDIR, COPILOT_DIR, NODE_USER, Sandbox} from './sandbox'
import type {Treatment, TreatmentResult} from './treatment'
import type {Model, ReasoningEffort} from './model'
import {isMessageType, parseMessage, type Message} from './copilot-cli'
import {getTestMetadata, parseTestResults} from './vitest'

const PLAYWRIGHT_BROWSERS_PATH = '/ms-playwright'
const SCREENSHOT_PATH = 'ui-snapshot.png'
const SCREENSHOT_SCRIPT_PATH = '.agent-eval-snapshot.mjs'
const SCREENSHOT_WIDTH = 1440
const SCREENSHOT_HEIGHT = 900

function getScreenshotScript(): string {
  return `
import {spawn} from 'node:child_process'
import process from 'node:process'
import {chromium} from 'playwright'

const server = spawn('npm', ['run', 'dev', '--', '--port', '3000'], {
  detached: true,
  stdio: 'inherit',
})
let browser

try {
  browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: {width: ${SCREENSHOT_WIDTH}, height: ${SCREENSHOT_HEIGHT}},
  })
  let lastError

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(\`Development server exited with code \${server.exitCode}\`)
    }

    try {
      await page.goto('http://127.0.0.1:3000', {
        timeout: 1000,
        waitUntil: 'networkidle',
      })
      lastError = undefined
      break
    } catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  if (lastError) {
    throw lastError
  }

  await page.screenshot({path: ${JSON.stringify(SCREENSHOT_PATH)}})
} finally {
  await browser?.close()
  if (server.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM')
    } catch {}
  }
}
`
}

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
  const args = getCopilotArgs({
    prompt,
    model: treatment.model,
    reasoningEffort: treatment.reasoningEffort,
  })
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
    return parseMessage(JSON.parse(trimmed))
  })

  const packageJson = JSON.parse(await sandbox.readFile('package.json')) as {
    scripts?: Record<string, string>
  }
  let hasScreenshot = false
  if (packageJson.scripts?.dev) {
    if (!treatment.scenario.browserTestPath) {
      console.log('Installing UI snapshot dependencies...')
      await sandbox.runCommand('npm', ['install', '--no-save', '--package-lock=false', 'playwright'], {
        user: NODE_USER,
      })
      console.log('Installing Playwright browser...')
      await sandbox.runCommand('./node_modules/.bin/playwright', ['install', '--with-deps', 'chromium'], {
        user: 'root',
        env: {
          PLAYWRIGHT_BROWSERS_PATH,
        },
      })
    }

    console.log('Capturing UI snapshot...')
    await sandbox.writeFile(SCREENSHOT_SCRIPT_PATH, getScreenshotScript())
    const screenshotResult = await sandbox.runCommand('node', [SCREENSHOT_SCRIPT_PATH], {
      user: NODE_USER,
      env: {
        PLAYWRIGHT_BROWSERS_PATH,
      },
      allowNonZeroExitCode: true,
    })
    await sandbox.runCommand('rm', ['-f', SCREENSHOT_SCRIPT_PATH], {user: NODE_USER})
    hasScreenshot = screenshotResult.exitCode === 0 && (await sandbox.exists(SCREENSHOT_PATH))
    if (!hasScreenshot) {
      console.warn('Unable to capture UI snapshot: %s', screenshotResult.stderr)
    }
  }

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
  const screenshotPath = path.join(workspacePath, SCREENSHOT_PATH)
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
      ...(hasScreenshot ? {screenshotPath: path.relative(process.cwd(), screenshotPath)} : {}),
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

export {getCopilotArgs, getScreenshotScript, getVitestConfig, run}
