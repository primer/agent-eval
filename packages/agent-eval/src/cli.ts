import {get as getEval} from '@primer/agent-evals'
import type {Eval} from '@primer/agent-evals'
import {list, find} from '@primer/agent-experiments'
import type {ExperimentConfig, Model, TreatmentConfig} from '@primer/agent-experiments'
import {AGENTS_DIR, CONTAINER_WORKDIR, COPILOT_DIR, NODE_USER, Sandbox} from '@primer/agent-sandbox'
import {randomUUID} from 'node:crypto'
import {existsSync} from 'node:fs'
import fs from 'node:fs/promises'
import {parseArgs} from 'node:util'
import {parseMessage, type Message} from './copilot-cli'
import {parseTestResults} from './vitest'
import path from 'node:path'

const COPILOT_GITHUB_TOKEN = process.env.COPILOT_GITHUB_TOKEN

if (!COPILOT_GITHUB_TOKEN) {
  throw new Error('COPILOT_GITHUB_TOKEN environment variable is required to run the experiments')
}

const {values} = parseArgs({
  options: {
    artifacts: {
      type: 'string',
      short: 'a',
      description: 'The directory to save artifacts to',
    },
    concurrency: {
      type: 'string',
      short: 'c',
      description: 'The number of treatments to run in parallel',
    },
    experiment: {
      type: 'string',
      short: 'e',
      description: 'The file name of the experiment to run',
    },
  },
})

const ARTIFACTS_DIR = path.resolve(values.artifacts ?? 'artifacts')
const parsedConcurrency = values.concurrency ? parseInt(values.concurrency, 10) : 1
const MAX_CONCURRENCY =
  Number.isFinite(parsedConcurrency) && Number.isInteger(parsedConcurrency) && parsedConcurrency >= 1
    ? parsedConcurrency
    : 1
const experimentConfigs: Array<ExperimentConfig> = []

if (!existsSync(ARTIFACTS_DIR)) {
  await fs.mkdir(ARTIFACTS_DIR, {recursive: true})
}

if (values.experiment) {
  const experiment = find(values.experiment)
  if (experiment) {
    experimentConfigs.push(experiment)
  } else {
    console.log('Experiments:')
    console.log(
      list()
        .map(([name]) => name)
        .join('\n'),
    )
  }
}

const ControlTreatment: TreatmentConfig = {
  name: 'Control',
}

type Treatment = {
  config: TreatmentConfig
  eval: Eval
  experiment: ExperimentConfig
  id: string
  model: Model
}

type TreatmentResult = {
  id: string
  treatment: Treatment
  artifacts: {
    copilotConfigPath: string
    directory: string
    skillsConfigPath: string
    testResultsPath: string
    workspacePath: string
  }
  assistant: {
    turns: number
    premiumRequests: number
    totalApiDurationMs: number
    sessionDurationMs: number
    tools: Record<string, number>
  }
  testResults: {
    numTotalTests: number
    numPassedTests: number
    numFailedTests: number
    numPendingTests: number
    numTodoTests: number
  }
}

const results: Array<TreatmentResult> = []

for (const config of experimentConfigs) {
  console.log('Running experiment:', config.name)

  const treatments: Array<Treatment> = config.models.flatMap(model => {
    return config.evals.flatMap(evalId => {
      return [
        {
          config: ControlTreatment,
          eval: getEval(evalId),
          experiment: config,
          id: randomUUID(),
          model,
        },
        ...config.treatments.map(treatment => {
          return {
            config: treatment,
            eval: getEval(evalId),
            experiment: config,
            id: randomUUID(),
            model,
          }
        }),
      ]
    })
  })

  // Randomize treatments to mitigate any ordering effects. We want to make sure
  // that if there are any external factors that could impact the evals (e.g.
  // rate limits, resource constraints), they are more likely to impact all
  // evals rather than just the ones at the end.
  const runResults = await run(randomize(treatments), {
    maxConcurrency: MAX_CONCURRENCY,
  })
  results.push(...runResults)
}

await fs.writeFile('results.json', JSON.stringify(results, null, 2))

function randomize<T>(input: Array<T>): Array<T> {
  const randomized: Array<T> = input.slice()

  // Fisher–Yates shuffle
  for (let i = randomized.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[randomized[i], randomized[j]] = [randomized[j], randomized[i]]
  }

  return randomized
}

type RunOptions = {
  maxConcurrency?: number
}

function run(treatments: Array<Treatment>, options?: RunOptions): Promise<Array<TreatmentResult>> {
  const maxConcurrency = options?.maxConcurrency ?? 1
  const queue = treatments.slice()
  // eslint-disable-next-line @typescript-eslint/no-shadow
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

    const promise = retry(() => runTreatment(treatment), 3).then(
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

async function runTreatment(treatment: Treatment): Promise<TreatmentResult> {
  console.log('Running treatment: %s (%s)', treatment.config.name, treatment.id)
  await using sandbox = await Sandbox.create()

  console.log('Copying files from: %s...', treatment.eval.directory)
  await sandbox.copy(treatment.eval.directory, CONTAINER_WORKDIR, {
    exclude: ['eval.config.ts', ...treatment.eval.testFiles, 'node_modules', '.next'],
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

  console.log('Running treatment setup...')
  await treatment.config.setup?.({
    sandbox,
  })

  console.log('Run build script...')
  await sandbox.runCommand('npm', ['run', 'build', '--if-present'], {
    user: NODE_USER,
  })

  console.log('Running copilot...')
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
      COPILOT_GITHUB_TOKEN: COPILOT_GITHUB_TOKEN!,
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
    console.log('Failed to parse copilot message: %s', line)
    return []
  })

  for (const [index, testPath] of treatment.eval.testPaths.entries()) {
    await sandbox.copy(testPath, treatment.eval.testFiles[index])
  }
  // Always pass vitest calls even if test suite fails
  await sandbox.runCommand(
    'sh',
    ['-c', 'npx vitest run "$@" --reporter json --outputFile test-results.json || true', 'vitest-run', ...treatment.eval.testFiles],
    {
      user: NODE_USER,
    },
  )

  const testResultsContent = await sandbox.readFile('test-results.json')
  const testResults = parseTestResults(JSON.parse(testResultsContent))
  if (!testResults.success) {
    throw new Error(`Failed to parse test results: ${testResults.error}`)
  }

  // Turns
  const assistantTurns = new Set()
  // Tools
  const toolCalls = new Map()

  for (const message of messages) {
    if (message.type === 'assistant.turn_start') {
      assistantTurns.add(message.data.turnId)
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
    throw new Error('No result message found in copilot output')
  }

  const artifactDirectory = path.join(ARTIFACTS_DIR, treatment.id)
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
      turns: assistantTurns.size,
      // Tokens
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
}
