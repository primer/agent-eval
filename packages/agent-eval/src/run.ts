import Queue from 'p-queue'
import * as z from 'zod/mini'
import {MessageSchema, parseMessage, type Message} from './copilot-cli'
import type {Plan} from './plan'
import {TrialSchema, type Trial} from './trial'
import type {Host} from './host'
// import {CONTAINER_WORKDIR, NODE_USER, Sandbox} from './sandbox'
import {CONTAINER_WORKDIR, NODE_USER, type Sandbox} from './sandbox'
import {parseTestResults, TestResultsSchema} from './vitest'
import {logger} from './logger'

const AssistantSchema = z.object({
  logs: z.array(MessageSchema),
  turns: z.number(),
  outputTokens: z.number(),
  premiumRequests: z.number(),
  totalApiDurationMs: z.number(),
  sessionDurationMs: z.number(),
  tools: z.record(z.string(), z.number()),
})

const WalkthroughSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('Unavailable')}),
  z.object({type: z.literal('Screenshot'), filepath: z.string()}),
  z.object({type: z.literal('Screenshots'), screenshots: z.array(z.string())}),
  z.object({type: z.literal('Video'), filepath: z.string()}),
])

const TrialResultSchema = z.object({
  trial: TrialSchema,
  assistant: z.object({
    sessions: z.array(z.array(MessageSchema)),
  }),
  testResults: TestResultsSchema,
  walkthrough: WalkthroughSchema,
})

type TrialResult = z.infer<typeof TrialResultSchema>

type RunOptions = {
  artifactsDirectory: string
  copilotToken: string
  maxConcurrency?: number
}

async function run(host: Host, sandbox: Sandbox, plan: Plan, options: RunOptions): Promise<Array<TrialResult>> {
  const {artifactsDirectory, copilotToken, maxConcurrency = 1} = options
  const queue = new Queue({
    concurrency: maxConcurrency,
  })

  const results = await Promise.all(
    plan.trials.map(trial => {
      return queue.add(() => {
        return retry(() => {
          return runTrial(host, sandbox, trial, {
            artifactsDirectory,
            copilotToken,
          })
        })
      })
    }),
  )

  return results
}

type RunTrialOptions = {
  artifactsDirectory: string
  copilotToken: string
}

async function runTrial(sandbox: Sandbox, trial: Trial, options: RunTrialOptions): Promise<TrialResult> {
  logger.info('Running trial treatment: %s (%s)', trial.treatment.name, trial.id)

  const {artifactsDirectory, copilotToken} = options

  logger.info('Copying files from: %s...', trial.scenario.directory)

  await sandbox.copy(trial.scenario.directory, CONTAINER_WORKDIR, {
    exclude: ['scenario.config.ts', 'scenario.test.ts', 'scenario.browser.test.ts', 'node_modules', '.next'],
  })
  await sandbox.runCommand('chown', ['-R', NODE_USER, '.'], {
    user: 'root',
  })

  logger.info('Obfuscating package name...')
  await sandbox.runCommand('npm', ['pkg', 'set', `name=${trial.id}`], {
    user: NODE_USER,
  })

  logger.info('Removing workspace dependency...')
  await sandbox.runCommand('npm', ['pkg', 'delete', 'devDependencies.@primer/agent-eval'], {
    user: NODE_USER,
  })

  logger.info('Installing dependencies...')
  await sandbox.runCommand('npm', ['install'], {
    user: NODE_USER,
  })

  if (trial.setup) {
    logger.info('Running generic setup...')
    await trial.setup({
      sandbox,
    })
  }

  if (trial.treatment.setup) {
    logger.info('Running treatment setup...')
    await trial.treatment.setup({
      sandbox,
    })
  }

  logger.info('Run build script...')
  await sandbox.runCommand('npm', ['run', 'build', '--if-present'], {
    user: NODE_USER,
  })

  logger.info('Running copilot...')
  const copilotOutput = await sandbox.runCommand(
    'copilot',
    ['--prompt', trial.scenario.prompt, '--model', trial.model.name, '--reasoning-effort', trial.model.reasoningEffort],
    {
      user: NODE_USER,
      env: {
        COPILOT_GITHUB_TOKEN: copilotToken,
      },
    },
  )
  const messages: Array<Message> = copilotOutput.stdout.split('\n').flatMap(line => {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      return []
    }
    return parseMessage(JSON.parse(trimmed))
  })

  logger.info('Running tests...')

  const TEST_PATH = 'scenario.test.ts'
  const VITEST_CONFIG_PATH = 'vitest.agent-eval.config.ts'
  const TEST_RESULTS_PATH = 'test-results.json'

  await sandbox.copy(trial.scenario.testPath, TEST_PATH)
  await sandbox.writeFile(VITEST_CONFIG_PATH, getVitestConfig(TEST_RESULTS_PATH))
  await sandbox.runCommand(
    'sh',
    ['-c', 'npx vitest run --config "$1" "$2" || true', 'vitest-run', VITEST_CONFIG_PATH, TEST_PATH],
    {
      user: NODE_USER,
      env: {},
    },
  )
  const testResultsContent = await sandbox.readFile(TEST_RESULTS_PATH)
  const rawTestResult: unknown = JSON.parse(testResultsContent)
  const testResults = parseTestResults(rawTestResult)
  if (!testResults.success) {
    throw new Error(`Failed to parse test results: ${testResults.error}`)
  }

  return {
    trial,
    assistant: {
      sessions: [messages],
    },
    testResults: testResults.data,
    walkthrough: {
      type: 'Unavailable',
    },
  }
}

function getVitestConfig(outputFile: string) {
  return `import {defineConfig} from 'vites/tconfig';

export default defineConfig({
  test: {
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

async function retry<T>(fn: () => Promise<T>, retries: number = 3): Promise<T> {
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

export {run, runTrial, TrialResultSchema as RunResultSchema}
export type {RunOptions as RunContext, TrialResult as RunResult}
