import {randomUUID} from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import {AGENTS_DIR, CONTAINER_WORKDIR, COPILOT_DIR, NODE_USER, Sandbox} from './sandbox'
import type {Treatment, TreatmentResult} from './treatment'
import type {Model, ReasoningEffort} from './model'
import {isMessageType, parseMessage, type Message} from './copilot-cli'
import {getTestMetadata, parseTestResults} from './vitest'

const PLAYWRIGHT_BROWSERS_PATH = '/ms-playwright'
const WALKTHROUGH_DIR = 'walkthrough'
const WALKTHROUGH_VIEWPORT_WIDTH = 1440
const WALKTHROUGH_VIEWPORT_HEIGHT = 900
const DEV_SERVER_PORT = 3000
const DEV_SERVER_SCRIPT_PATH = '.agent-eval-dev-server.mjs'
const DEV_SERVER_PID_PATH = '.agent-eval-dev-server.pid'

function getDevServerScript(): string {
  return `
import {spawn} from 'node:child_process'
import fs from 'node:fs'

const PORT = ${DEV_SERVER_PORT}
const PID_PATH = ${JSON.stringify(DEV_SERVER_PID_PATH)}

const server = spawn('npm', ['run', 'dev', '--', '--port', String(PORT)], {
  detached: true,
  stdio: 'ignore',
})
server.unref()

if (server.pid) {
  fs.writeFileSync(PID_PATH, String(server.pid))
}

let ready = false
for (let attempt = 0; attempt < 60; attempt += 1) {
  if (server.exitCode !== null) {
    break
  }

  try {
    await fetch(\`http://127.0.0.1:\${PORT}\`)
    ready = true
    break
  } catch {
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

if (!ready) {
  process.exit(1)
}
`
}

function getWalkthroughPrompt(): string {
  return `The application you just built is now running locally at http://localhost:${DEV_SERVER_PORT}. Record a visual walkthrough of what you implemented so a reviewer can see it without running the code themselves, then save the result inside a "${WALKTHROUGH_DIR}" directory (create it if it doesn't exist) at the root of the project:

- If what you built is a single screen, take one screenshot and save it as ${WALKTHROUGH_DIR}/screenshot.png.
- If there are a few distinct views worth showing (for example separate pages or states), take a screenshot of each, in the order a reviewer should look at them, saved as ${WALKTHROUGH_DIR}/01-*.png, ${WALKTHROUGH_DIR}/02-*.png, etc.
- If reviewing the change requires seeing an interactive flow across multiple steps or pages, record a short video of yourself clicking through it instead and save it as ${WALKTHROUGH_DIR}/walkthrough.webm.

Set the browser viewport to ${WALKTHROUGH_VIEWPORT_WIDTH}x${WALKTHROUGH_VIEWPORT_HEIGHT} before capturing anything. Only capture the walkthrough, do not make any further code changes.`
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg'])
const VIDEO_EXTENSIONS = new Set(['.webm', '.mp4'])

async function getWalkthroughArtifacts(
  workspacePath: string,
): Promise<{screenshotPaths: Array<string>; videoPath?: string}> {
  const walkthroughDirectory = path.join(workspacePath, WALKTHROUGH_DIR)
  let entries: Array<string>
  try {
    entries = (await fs.readdir(walkthroughDirectory)).sort((a, b) => a.localeCompare(b))
  } catch {
    return {screenshotPaths: []}
  }

  const screenshotPaths: Array<string> = []
  let videoPath: string | undefined
  for (const entry of entries) {
    const extension = path.extname(entry).toLowerCase()
    const relativePath = path.relative(process.cwd(), path.join(walkthroughDirectory, entry))
    if (IMAGE_EXTENSIONS.has(extension)) {
      screenshotPaths.push(relativePath)
    } else if (!videoPath && VIDEO_EXTENSIONS.has(extension)) {
      videoPath = relativePath
    }
  }

  return {screenshotPaths, videoPath}
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
  if (packageJson.scripts?.dev) {
    console.log('Starting development server for UI walkthrough...')
    await sandbox.writeFile(DEV_SERVER_SCRIPT_PATH, getDevServerScript())
    const devServerResult = await sandbox.runCommand('node', [DEV_SERVER_SCRIPT_PATH], {
      user: NODE_USER,
      allowNonZeroExitCode: true,
    })
    await sandbox.runCommand('rm', ['-f', DEV_SERVER_SCRIPT_PATH], {user: NODE_USER})

    if (devServerResult.exitCode !== 0) {
      console.warn('Unable to start development server for UI walkthrough: %s', devServerResult.stderr)
    } else {
      console.log('Recording UI walkthrough...')
      await sandbox.addMcpServer('playwright', {
        type: 'local',
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest', '--output-dir', WALKTHROUGH_DIR],
        tools: ['*'],
      })

      const walkthroughArgs = getCopilotArgs({
        prompt: getWalkthroughPrompt(),
        model: treatment.model,
        reasoningEffort: treatment.reasoningEffort,
      })
      const walkthroughResult = await sandbox.runCommand('copilot', walkthroughArgs, {
        user: NODE_USER,
        env: {
          COPILOT_GITHUB_TOKEN: copilotToken,
        },
        allowNonZeroExitCode: true,
      })
      if (walkthroughResult.exitCode !== 0) {
        console.warn('Unable to record UI walkthrough: %s', walkthroughResult.stderr)
      }
    }

    await sandbox.runCommand(
      'sh',
      ['-c', `kill "$(cat "$1" 2>/dev/null)" 2>/dev/null; rm -f "$1"`, 'kill-dev-server', DEV_SERVER_PID_PATH],
      {user: NODE_USER, allowNonZeroExitCode: true},
    )
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

  const {screenshotPaths, videoPath} = await getWalkthroughArtifacts(workspacePath)

  return {
    id: randomUUID(),
    treatment,
    artifacts: {
      directory: artifactDirectory,
      copilotConfigPath,
      skillsConfigPath,
      ...(screenshotPaths.length > 0 ? {screenshotPaths} : {}),
      ...(videoPath ? {videoPath} : {}),
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

export {getCopilotArgs, getDevServerScript, getVitestConfig, getWalkthroughPrompt, run}
