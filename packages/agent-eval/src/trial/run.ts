import path from 'node:path'
import type Queue from 'p-queue'
import * as z from 'zod/mini'
import {DefaultHost, type Host} from '../host'
import {logger} from '../logger'
import {AGENTS_DIR, CONTAINER_WORKDIR, COPILOT_DIR, NODE_USER, SKILLS_DIR, type Sandbox} from '../sandbox'
import {TrialSchema, type Trial} from './trial'
import {parseMessage, type Message} from '../copilot-cli'
import {
  getJudgeModel,
  getJudgePrompt,
  getJudgeReportFilename,
  JudgeOutputSchema,
  parseJudgeReport,
  type JudgeOutput,
  type JudgeResult,
} from '../judge'
import {AgentSessionSchema, getAgentSession} from '../agent'
import {CheckOutputSchema, type CheckOutput} from '../check'

const TrialWalkthroughSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('Unavailable')}),
  z.object({type: z.literal('Screenshot'), filepath: z.string()}),
  z.object({type: z.literal('Screenshots'), screenshots: z.array(z.string())}),
  z.object({type: z.literal('Video'), filepath: z.string()}),
])

type TrialWalkthrough = z.infer<typeof TrialWalkthroughSchema>

type RunTrialOptions = {
  artifactsDirectory: string
  copilotQueue: Queue
  copilotToken: string
  host?: Host
  sandbox: Sandbox
  trial: Trial
}

const TrialAgentSchema = z.object({
  sessions: z.array(AgentSessionSchema),
})

const TrialArtifactsSchema = z.object({
  directory: z.string(),
  copilotConfigDirectory: z.string(),
  skillsConfigDirectory: z.string(),
  walkthroughDirectory: z.string(),
  workspaceDirectory: z.string(),
})

const TrialChecksSchema = z.array(CheckOutputSchema)

const TrialJudgesSchema = z.array(JudgeOutputSchema)

const RunTrialResultSchema = z.object({
  agent: TrialAgentSchema,
  artifacts: TrialArtifactsSchema,
  checks: TrialChecksSchema,
  judges: TrialJudgesSchema,
  trial: TrialSchema,
  walkthrough: TrialWalkthroughSchema,
})

type RunTrialResult = z.infer<typeof RunTrialResultSchema>

async function runTrial({
  artifactsDirectory,
  copilotQueue,
  copilotToken,
  host = DefaultHost,
  sandbox,
  trial,
}: RunTrialOptions): Promise<RunTrialResult> {
  logger.info('Running trial: %s', trial.id)

  await setupStage.run({
    sandbox,
    trial,
  })

  const {agent} = await taskStage.run({
    copilotQueue,
    copilotToken,
    sandbox,
    trial,
  })

  const {results: checks} = await verifyStage.run({
    sandbox,
    trial,
  })

  const {results: judges} = await judgeStage.run({
    copilotQueue,
    copilotToken,
    sandbox,
    trial,
  })

  const {walkthrough} = await captureStage.run({
    copilotQueue,
    copilotToken,
    sandbox,
    trial,
  })

  const {artifacts} = await saveStage.run({
    artifactsDirectory,
    host,
    sandbox,
    trial,
    walkthrough,
  })

  return {
    artifacts,
    agent,
    checks,
    trial,
    judges,
    walkthrough,
  }
}

type SetupStageOptions = {
  sandbox: Sandbox
  trial: Trial
}

const setupStage = {
  name: 'Setup',
  async run({sandbox, trial}: SetupStageOptions) {
    logger.info('[%s] Running setup', trial.id)

    logger.info('[%s] Copying files from: %s...', trial.id, trial.scenario.directory)

    const judgeFiles = trial.scenario.judges.flatMap(judge => {
      return judge.files.map(({filepath}) => {
        return filepath
      })
    })
    const checkFiles = trial.scenario.checks.flatMap(check => {
      return check.files.map(({relativePath}) => {
        return relativePath
      })
    })
    const exclude = Array.from(
      new Set([
        'scenario.config.ts',
        'scenario.test.ts',
        'browser.test.ts',
        'scenario.browser.test.ts',
        'node_modules',
        '.next',
        'dist',
        ...judgeFiles,
        ...checkFiles,
      ]),
    )

    logger.debug('[%s] Excluding files: %o', trial.id, exclude)

    await sandbox.copy(trial.scenario.directory, CONTAINER_WORKDIR, {
      exclude,
    })
    await sandbox.runCommand('chown', ['-R', NODE_USER, '.'], {
      user: 'root',
    })

    logger.info('[%s] Obfuscating package name', trial.id)
    await sandbox.runCommand('npm', ['pkg', 'set', `name=${trial.id}`], {
      user: NODE_USER,
    })

    logger.info('[%s] Removing workspace dependency', trial.id)
    await sandbox.runCommand('npm', ['pkg', 'delete', 'devDependencies.@primer/agent-eval'], {
      user: NODE_USER,
    })

    logger.info('[%s] Installing dependencies', trial.id)
    await sandbox.runCommand('npm', ['install'], {
      user: NODE_USER,
    })

    if (trial.setup) {
      logger.info('[%s] Running generic setup', trial.id)
      await trial.setup({
        sandbox,
      })
    }

    if (trial.treatment.setup) {
      logger.info('[%s] Running treatment setup', trial.id)
      await trial.treatment.setup({
        sandbox,
      })
    }

    logger.info('[%s] Running build script', trial.id)
    await sandbox.runCommand('npm', ['run', 'build', '--if-present'], {
      user: NODE_USER,
    })
  },
}

type RunStageOptions = {
  copilotQueue: Queue
  copilotToken: string
  sandbox: Sandbox
  trial: Trial
}

const taskStage = {
  name: 'Task',
  async run({copilotQueue, copilotToken, sandbox, trial}: RunStageOptions) {
    logger.info('[%s] Running agent', trial.id)

    const copilotOutput = await copilotQueue.add(async () => {
      return await sandbox.runCommand(
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
    })
    const messages: Array<Message> = copilotOutput.stdout.split('\n').flatMap(line => {
      const trimmed = line.trim()
      if (trimmed.length === 0) {
        return []
      }
      return parseMessage(JSON.parse(trimmed))
    })

    return {
      agent: {
        sessions: [getAgentSession(messages)],
      },
    }
  },
}

type VerifyStageOptions = {
  sandbox: Sandbox
  trial: Trial
}

const verifyStage = {
  name: 'Verify',
  async run({sandbox, trial}: VerifyStageOptions) {
    logger.info('[%s] Running checks', trial.id)

    const results: Array<CheckOutput> = []

    for (const check of trial.scenario.checks) {
      const copied = new Set<string>()

      for (const {filepath, relativePath} of check.files) {
        logger.debug('[%s] Copying check file: %s to %s', trial.id, filepath, relativePath)
        await sandbox.copy(filepath, relativePath)
        copied.add(relativePath)
      }

      if (copied.size > 0) {
        await sandbox.runCommand('chown', ['-R', NODE_USER, '--', ...Array.from(copied)], {
          user: 'root',
        })
      }

      logger.info('[%s] Running check: %s', trial.id, check.name)

      const checkRunResults = await check.run({
        logger: logger.child({
          trialId: trial.id,
          check: check.name,
        }),
        sandbox,
      })

      results.push(
        ...checkRunResults.map(runResult => {
          return {
            check: {
              name: check.name,
              description: check.description,
              files: check.files,
            },
            result: runResult,
          }
        }),
      )

      if (copied.size > 0) {
        logger.debug('[%s] Cleaning up check files: %o', trial.id, Array.from(copied))
        await sandbox.runCommand('rm', ['-rf', ...Array.from(copied)], {
          user: NODE_USER,
        })
      }
    }

    return {
      results,
    }
  },
}

type JudgeStageOptions = {
  copilotQueue: Queue
  copilotToken: string
  sandbox: Sandbox
  trial: Trial
}

const judgeStage = {
  name: 'Judge',
  async run({copilotQueue, copilotToken, sandbox, trial}: JudgeStageOptions) {
    logger.debug('Running judge stage for: %s', trial.id)

    const results: Array<JudgeOutput> = []

    if (trial.scenario.judges.length < 1) {
      return {
        results,
      }
    }

    logger.info('[%s] Running judges', trial.id)

    for (const judge of trial.scenario.judges) {
      logger.info('[%s] Running judge: %s', trial.id, judge.name)

      for (const file of judge.files) {
        logger.debug('[%s] Copying judge file: %s to %s', trial.id, file.filepath, file.relativePath)
        await sandbox.copy(file.filepath, file.relativePath)
      }

      if (judge.files.length > 0) {
        await sandbox.runCommand(
          'chown',
          [
            '-R',
            NODE_USER,
            '--',
            ...judge.files.map(file => {
              return file.relativePath
            }),
          ],
          {
            user: 'root',
          },
        )
      }

      const model = getJudgeModel(judge, trial)
      const prompt = getJudgePrompt(judge)
      const copilotOutput = await copilotQueue.add(async () => {
        return await sandbox.runCommand(
          'copilot',
          [
            '--prompt',
            prompt,
            '--model',
            model.name,
            '--reasoning-effort',
            model.reasoningEffort,
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
      })
      const messages: Array<Message> = copilotOutput.stdout.split('\n').flatMap(line => {
        const trimmed = line.trim()
        if (trimmed.length === 0) {
          return []
        }
        return parseMessage(JSON.parse(trimmed))
      })
      const session = getAgentSession(messages)
      const judgeReportPath = getJudgeReportFilename(judge)

      let result: JudgeResult
      if (await sandbox.exists(judgeReportPath)) {
        result = parseJudgeReport(judge, await sandbox.readFile(judgeReportPath))
        if (result.type === 'error') {
          logger.warn('[%s] Judge "%s" report is invalid: %s', trial.id, judge.name, result.message)
        }

        logger.debug('[%s] Cleaning up judge report: %s', trial.id, judgeReportPath)
        await sandbox.runCommand('rm', ['-rf', judgeReportPath], {
          user: NODE_USER,
        })
      } else {
        logger.warn('[%s] Judge "%s" did not write its report: %s', trial.id, judge.name, judgeReportPath)
        result = {type: 'unknown'}
      }

      for (const file of judge.files) {
        logger.debug('[%s] Cleaning up judge file: %s', trial.id, file.relativePath)
        await sandbox.runCommand('rm', ['-rf', file.relativePath], {
          user: NODE_USER,
        })
      }

      results.push({
        judge,
        result,
        agent: {
          session,
        },
      })
    }

    return {
      results,
    }
  },
}

const WALKTHROUGH_DIR = 'walkthrough'
const WALKTHROUGH_VIEWPORT_WIDTH = 1440
const WALKTHROUGH_VIEWPORT_HEIGHT = 900
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg'])
const AGENT_BROWSER_SKILL_DIRECTORY = path.posix.join(SKILLS_DIR, 'agent-browser')

type CaptureStageOptions = {
  copilotQueue: Queue
  copilotToken: string
  sandbox: Sandbox
  trial: Trial
}

const captureStage = {
  name: 'Capture',
  async run({copilotQueue, copilotToken, sandbox, trial}: CaptureStageOptions) {
    logger.info('[%s] Capturing walkthrough', trial.id)

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

After saving and verifying the walkthrough artifacts, close the agent-browser session you opened and stop the development server and any other background processes you started. Use stop_bash with the shellId returned when starting an async Bash command, and verify that it has stopped. Only clean up processes and browser sessions you started; leave unrelated processes and the saved artifacts intact. Complete this cleanup before calling task_complete so background processes do not keep the Copilot CLI running. If cleanup fails, report the failure instead of claiming completion.

Only capture the walkthrough, do not make any further code changes.`
    const walkthroughResult = await copilotQueue.add(async () => {
      return await sandbox.runCommand(
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
    })

    if (walkthroughResult.exitCode !== 0) {
      logger.warn('[%s] Unable to capture walkthrough: %s', trial.id, walkthroughResult.stderr)
    }

    logger.debug('[%s] Removing walkthrough skill...', trial.id)
    await sandbox.runCommand('rm', ['-rf', AGENT_BROWSER_SKILL_DIRECTORY], {
      user: NODE_USER,
    })

    let walkthrough: TrialWalkthrough = {
      type: 'Unavailable',
    }

    if (await sandbox.exists(path.posix.join(WALKTHROUGH_DIR, 'screenshot.png'))) {
      walkthrough = {
        type: 'Screenshot',
        filepath: path.posix.join(WALKTHROUGH_DIR, 'screenshot.png'),
      }
    } else if (await sandbox.exists(path.posix.join(WALKTHROUGH_DIR, 'screenshots'))) {
      const entries = await sandbox.readdir(path.posix.join(WALKTHROUGH_DIR, 'screenshots'))
      const screenshots = entries
        .filter(filename => {
          return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase())
        })
        .toSorted((a, b) => {
          return a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'})
        })

      if (screenshots.length > 0) {
        walkthrough = {
          type: 'Screenshots',
          screenshots: screenshots.map(filename => {
            return path.posix.join(WALKTHROUGH_DIR, 'screenshots', filename)
          }),
        }
      }
    } else if (await sandbox.exists(path.posix.join(WALKTHROUGH_DIR, 'walkthrough.webm'))) {
      walkthrough = {
        type: 'Video',
        filepath: path.posix.join(WALKTHROUGH_DIR, 'walkthrough.webm'),
      }
    }

    return {
      walkthrough,
    }
  },
}

type SaveStageOptions = {
  artifactsDirectory: string
  host: Host
  sandbox: Sandbox
  trial: Trial
  walkthrough: TrialWalkthrough
}

const saveStage = {
  name: 'Save',
  async run({artifactsDirectory, host, sandbox, trial, walkthrough}: SaveStageOptions) {
    logger.info('[%s] Saving trial results', trial.id)

    const artifactDirectory = path.join(artifactsDirectory, trial.id)
    const workspaceDirectory = path.join(artifactDirectory, 'workspace')
    const walkthroughDirectory = path.join(artifactDirectory, 'walkthrough')
    const copilotConfigDirectory = path.join(artifactDirectory, '.copilot')
    const skillsConfigDirectory = path.join(artifactDirectory, '.agents')

    if (host.existsSync(artifactDirectory)) {
      logger.debug('[%s] Cleaning up artifact directory: %s', trial.id, artifactDirectory)
      await host.fs.rm(artifactDirectory, {recursive: true, force: true})
    }

    logger.debug('[%s] Creating artifact directory: %s', trial.id, artifactDirectory)
    await host.fs.mkdir(artifactDirectory, {recursive: true})

    logger.debug('[%s] Creating workspace directory: %s', trial.id, workspaceDirectory)
    await host.fs.mkdir(workspaceDirectory, {recursive: true})

    logger.info('[%s] Downloading artifacts to: %s', trial.id, artifactDirectory)

    logger.debug('[%s] Downloading agent workspace to: %s', trial.id, workspaceDirectory)
    const judgeFiles = Array.from(
      new Set(
        trial.scenario.judges.flatMap(judge => {
          return judge.files.map(file => {
            return file.relativePath
          })
        }),
      ),
    )
    await sandbox.download(CONTAINER_WORKDIR, workspaceDirectory, {
      ignore(name) {
        const relativePath = (path.isAbsolute(name) ? path.relative(workspaceDirectory, name) : name)
          .split(path.sep)
          .join(path.posix.sep)
        if (
          judgeFiles.some(judgeFileRelativePath => {
            return (
              relativePath === judgeFileRelativePath ||
              relativePath.startsWith(`${judgeFileRelativePath}/`) ||
              judgeFileRelativePath.startsWith(`${relativePath}/`)
            )
          })
        ) {
          return false
        }
        return (
          name.includes('node_modules') ||
          name.includes('.next') ||
          name.includes('.turbo') ||
          name.includes('dist') ||
          name.includes(WALKTHROUGH_DIR)
        )
      },
    })

    logger.debug('[%s] Downloading copilot config to: %s', trial.id, copilotConfigDirectory)
    await sandbox.download(COPILOT_DIR, copilotConfigDirectory)

    logger.debug('[%s] Downloading skills config to: %s', trial.id, skillsConfigDirectory)
    await sandbox.download(AGENTS_DIR, skillsConfigDirectory)

    if (walkthrough.type !== 'Unavailable') {
      await host.fs.mkdir(walkthroughDirectory, {
        recursive: true,
      })

      await sandbox.download(WALKTHROUGH_DIR, walkthroughDirectory)
    }

    return {
      artifacts: {
        directory: artifactDirectory,
        copilotConfigDirectory,
        skillsConfigDirectory,
        walkthroughDirectory,
        workspaceDirectory,
      },
    }
  },
}

export {
  TrialAgentSchema,
  TrialArtifactsSchema,
  TrialChecksSchema,
  TrialJudgesSchema,
  TrialWalkthroughSchema,
  runTrial,
  RunTrialResultSchema,
}
export type {RunTrialResult}
