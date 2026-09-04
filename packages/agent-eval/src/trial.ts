import path from 'node:path'
import {isMessageType, MessageSchema, parseMessage, type Message} from './copilot-cli'
import {DefaultHost, type Host} from './host'
import {AGENTS_DIR, CONTAINER_WORKDIR, COPILOT_DIR, NODE_USER, SKILLS_DIR, type Sandbox} from './sandbox'
import {parseTestResults, TestResultsSchema} from './vitest'
import {logger} from './logger'
import * as z from 'zod/mini'
import {ModelVariantSchema} from './model'
import {ScenarioSchema} from './scenario'
import {TreatmentSchema, TreatmentSetupSchema} from './treatment'

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
})

const TrialAgentSchema = z.object({
  sessions: z.array(AgentSessionSchema),
})

const TrialResultSchema = z.object({
  artifacts: TrialArtifactsSchema,
  trial: TrialSchema,
  agent: TrialAgentSchema,
  testResults: TestResultsSchema,
  walkthrough: WalkthroughSchema,
})

type TrialResult = z.infer<typeof TrialResultSchema>

type PortableTrialPaths = Pick<TrialResult, 'artifacts' | 'walkthrough'>

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
      copilotConfigDirectory: toPortablePath(result.artifacts.copilotConfigDirectory),
      skillsConfigDirectory: toPortablePath(result.artifacts.skillsConfigDirectory),
      testResultsPath: toPortablePath(result.artifacts.testResultsPath),
      workspaceDirectory: toPortablePath(result.artifacts.workspaceDirectory),
    },
    walkthrough,
  }
}

async function run({
  artifactsDirectory,
  copilotToken,
  host = DefaultHost,
  sandbox,
  trial,
}: {
  artifactsDirectory: string
  copilotToken: string
  host?: Host
  sandbox: Sandbox
  trial: Trial
}): Promise<TrialResult> {
  const logPrefix = `[${trial.scenario.id}] [${trial.treatment.name}] [${trial.model.name} (${trial.model.reasoningEffort})]`

  logger.info('%s Running trial: %s', logPrefix, trial.id)

  logger.info('%s Copying files from: %s...', logPrefix, trial.scenario.directory)

  await sandbox.copy(trial.scenario.directory, CONTAINER_WORKDIR, {
    exclude: ['scenario.config.ts', 'scenario.test.ts', 'scenario.browser.test.ts', 'node_modules', '.next', 'dist'],
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

  logger.info('%s Installing dependencies...', logPrefix)
  await sandbox.runCommand('npm', ['install'], {
    user: NODE_USER,
  })

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

  logger.info('%s Running copilot...', logPrefix)
  const copilotOutput = await sandbox.runCommand(
    'copilot',
    [
      '--prompt',
      trial.scenario.prompt,
      '--model',
      trial.model.name,
      '--reasoning-effort',
      trial.model.reasoningEffort,
      '--mode',
      'autopilot',
      '--allow-all',
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
  const messages: Array<Message> = copilotOutput.stdout.split('\n').flatMap(line => {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      return []
    }
    return parseMessage(JSON.parse(trimmed))
  })

  logger.info('%s Running tests...', logPrefix)

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
  logger.debug('%s Capturing walkthrough...', logPrefix)
  await sandbox.runCommand('apt-get', ['install', '-y', 'chromium'], {
    user: 'root',
  })
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

  logger.info('%s Downloading artifacts to: %s...', logPrefix, artifactDirectory)

  logger.debug('%s Downloading agent workspace to: %s...', logPrefix, workspaceDirectory)
  await sandbox.download(CONTAINER_WORKDIR, workspaceDirectory, {
    ignore(name) {
      return name.includes('node_modules') || name.includes('.next') || name.includes('.turbo') || name.includes('dist')
    },
  })

  logger.debug('%s Downloading copilot config to: %s...', logPrefix, copilotConfigDirectory)
  await sandbox.download(COPILOT_DIR, copilotConfigDirectory)

  logger.debug('%s Downloading skills config to: %s...', logPrefix, skillsConfigDirectory)
  await sandbox.download(AGENTS_DIR, skillsConfigDirectory)

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
    agent: {
      sessions: [getAgentSession(messages)],
    },
    testResults: testResults.data,
    walkthrough,
  }
}

function getAgentSession(messages: Array<Message>): AgentSession {
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

  const result = messages.find(message => isMessageType(message, 'result'))
  if (!result) {
    throw new Error('No result message found in copilot output')
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

function getVitestConfig(outputFile: string) {
  return `import {defineConfig} from 'vitest/config';

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
  run,
  compare,
  getPortableTrialPaths,
}
export type {Trial, TrialResult}
