import {randomUUID} from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import {AGENTS_DIR, CONTAINER_WORKDIR, COPILOT_DIR, NODE_USER, Sandbox} from './sandbox'
import type {Treatment, TreatmentResult} from './treatment'
import type {Model, ReasoningEffort} from './model'
import {isMessageType, parseMessage, type Message} from './copilot-cli'
import {getTestMetadata, parseTestResults} from './vitest'

type RunOptions = {
  artifactsDirectory: string
  copilotToken: string
  dockerImage?: string
  maxConcurrency?: number
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
    exclude: ['scenario.config.ts', 'scenario.test.ts', 'node_modules', '.next'],
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

  const TEST_PATH = 'scenario.test.ts'
  const VITEST_CONFIG_PATH = 'vitest.agent-eval.config.ts'
  await sandbox.copy(treatment.scenario.testPath, TEST_PATH)
  await sandbox.writeFile(
    VITEST_CONFIG_PATH,
    `
import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    reporters: [['json', {outputFile: 'test-results.json', includeTaskLocation: true}]],
  },
})
`,
  )
  // Always pass vitest calls even if test suite fails
  await sandbox.runCommand(
    'sh',
    ['-c', 'npx vitest run --config "$1" "$2" || true', 'vitest-run', VITEST_CONFIG_PATH, TEST_PATH],
    {
      user: NODE_USER,
    },
  )

  const testResultsContent = await sandbox.readFile('test-results.json')
  const testResults = parseTestResults(JSON.parse(testResultsContent))
  if (!testResults.success) {
    throw new Error(`Failed to parse test results: ${testResults.error}`)
  }
  const testSource = await fs.readFile(treatment.scenario.testPath, 'utf8')

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
      outputTokens += message.data.outputTokens
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
      numFailedTests: testResults.data.numFailedTests,
      numPassedTests: testResults.data.numPassedTests,
      numPendingTests: testResults.data.numPendingTests,
      numTodoTests: testResults.data.numTodoTests,
      numTotalTests: testResults.data.numTotalTests,
      tests: getTestMetadata(testResults.data, testSource),
    },
  }
}

export {getCopilotArgs, run}
