import path from 'node:path'
import Queue from 'p-queue'
import * as z from 'zod/mini'
import {MessageSchema, parseMessage, type Message} from './copilot-cli'
import type {Plan} from './plan'
import {TrialSchema, type Trial} from './trial'
import {DefaultHost, type Host} from './host'
// import {CONTAINER_WORKDIR, NODE_USER, Sandbox} from './sandbox'
import {AGENTS_DIR, CONTAINER_WORKDIR, COPILOT_DIR, NODE_USER, type Sandbox} from './sandbox'
import {parseTestResults, TestResultsSchema} from './vitest'
import {logger} from './logger'
import type {EnvironmentConfig} from './environment'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg'])

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

type Walkthrough = z.infer<typeof WalkthroughSchema>

const TrialResultSchema = z.object({
  artifacts: z.object({
    directory: z.string(),
    copilotConfigDirectory: z.string(),
    skillsConfigDirectory: z.string(),
    testResultsPath: z.string(),
    workspaceDirectory: z.string(),
  }),
  trial: TrialSchema,
  assistant: z.object({
    sessions: z.array(
      z.object({
        messages: z.array(MessageSchema),
      }),
    ),
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

async function run({
  env,
  host = DefaultHost,
  plan,
}: {
  env: EnvironmentConfig
  host?: Host
  plan: Plan
}): Promise<Array<TrialResult>> {
  const queue = new Queue({
    concurrency: env.concurrency,
  })

  const results = await Promise.all(
    plan.trials.map(trial => {
      return queue.add(() => {
        return retry(async () => {
          await using sandbox = await host.createSandbox({
            dockerImage: env.dockerImage,
          })
          return runTrial(host, sandbox, trial, {
            artifactsDirectory: env.artifactsDirectory,
            copilotToken: env.copilotToken,
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

async function runTrial(host: Host, sandbox: Sandbox, trial: Trial, options: RunTrialOptions): Promise<TrialResult> {
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

  const WALKTHROUGH_DIR = 'walkthrough'
  const WALKTHROUGH_VIEWPORT_WIDTH = 1440
  const WALKTHROUGH_VIEWPORT_HEIGHT = 900

  const artifactDirectory = path.join(artifactsDirectory, trial.id)
  const workspaceDirectory = path.join(artifactDirectory, 'workspace')
  const walkthroughPath = path.join(artifactDirectory, 'walkthrough')
  const copilotConfigDirectory = path.join(artifactDirectory, '.copilot')
  const skillsConfigDirectory = path.join(artifactDirectory, '.agents')
  const testResultsPath = path.join(workspaceDirectory, 'test-results.json')

  if (host.existsSync(artifactDirectory)) {
    await host.fs.rm(artifactDirectory, {recursive: true, force: true})
  }
  await host.fs.mkdir(workspaceDirectory, {recursive: true})

  logger.info('Downloading agent workspace to: %s...', workspaceDirectory)
  await sandbox.download(CONTAINER_WORKDIR, workspaceDirectory, {
    ignore(name) {
      return name.includes('node_modules') || name.includes('.next') || name.includes('dist')
    },
  })

  logger.info('Downloading copilot config to: %s...', copilotConfigDirectory)
  await sandbox.download(COPILOT_DIR, copilotConfigDirectory)

  logger.info('Downloading skills config to: %s...', skillsConfigDirectory)
  await sandbox.download(AGENTS_DIR, skillsConfigDirectory)

  let walkthrough: Walkthrough = {
    type: 'Unavailable',
  }

  if (host.existsSync(path.join(workspaceDirectory, WALKTHROUGH_DIR))) {
    logger.info(
      'Moving walkthrough artifacts from: %s to: %s...',
      path.join(workspaceDirectory, WALKTHROUGH_DIR),
      walkthroughPath,
    )
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
      copilotConfigDirectory,
      skillsConfigDirectory,
      testResultsPath,
      workspaceDirectory,
    },
    trial,
    assistant: {
      sessions: [
        {
          messages,
        },
      ],
    },
    testResults: testResults.data,
    walkthrough,
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
