import path from 'node:path'
import {parseMessage, type Message} from './copilot-cli'
import {logger} from './logger'
import type {ModelVariant} from './model'
import {COPILOT_DIR, NODE_USER, NPM_GLOBAL_DIR, type Sandbox} from './sandbox'

const COPILOT_SDK_VERSION = '1.0.11'
const COPILOT_SDK_RUNNER_PATH = '/tmp/agent-eval-copilot-sdk-runner.cjs'
const COPILOT_SDK_RUNNER_CONFIG_PATH = '/tmp/agent-eval-copilot-sdk-runner-config.json'

function normalizeCopilotMessage(message: Record<string, unknown>): Record<string, unknown> {
  const normalized = {...message, parentId: message.parentId ?? ''}
  const data = (typeof message.data === 'object' && message.data !== null ? message.data : {}) as Record<
    string,
    unknown
  >
  let defaults: Record<string, unknown>

  switch (message.type) {
    case 'user.message':
      defaults = {
        content: '',
        transformedContent: '',
        attachments: [],
        supportedNativeDocumentMimeTypes: [],
        agentMode: '',
        interactionId: '',
        parentAgentTaskId: '',
      }
      break
    case 'assistant.message':
      defaults = {toolRequests: [], interactionId: '', turnId: '', requestId: ''}
      break
    case 'assistant.turn_start':
      defaults = {interactionId: ''}
      break
    case 'assistant.tool_call_delta':
      defaults = {toolName: ''}
      break
    case 'tool.execution_start':
      defaults = {arguments: {}, turnId: '', model: ''}
      break
    case 'tool.execution_complete': {
      const details = data.success ? data.result : data.error
      return {
        ...normalized,
        data: {
          interactionId: '',
          turnId: '',
          model: '',
          toolTelemetry: {},
          ...data,
          [data.success ? 'result' : 'error']: {
            ...(data.success ? {content: '', detailedContent: ''} : {message: '', code: ''}),
            ...(typeof details === 'object' && details !== null ? details : {}),
          },
        },
      }
    }
    case 'session.task_complete':
      defaults = {summary: '', success: false}
      break
    default:
      return normalized
  }

  return {...normalized, data: {...defaults, ...data}}
}

function getCopilotSdkRunnerScript(): string {
  return `
const fs = require('node:fs/promises')
const {CopilotClient, approveAll} = require('@github/copilot-sdk')

function emit(event) {
  console.log(JSON.stringify({...event, parentId: event.parentId ?? ''}))
}

async function main() {
  const config = JSON.parse(await fs.readFile(process.argv[2], 'utf8'))
  const startedAt = Date.now()
  let sessionId = ''
  let totalApiDurationMs = 0
  let codeChanges = {linesAdded: 0, linesRemoved: 0, filesModified: []}

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
      throw new Error(errors.map(error => {
        return error.message
      }).join('\\n'))
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
  copilotToken,
}: {
  sandbox: Sandbox
  prompt: string
  model: ModelVariant
  copilotToken: string
}): Promise<Array<Message>> {
  logger.info('Installing copilot sdk...')
  await sandbox.runCommand(
    'npm',
    ['install', '-g', '--allow-scripts=koffi', `@github/copilot-sdk@${COPILOT_SDK_VERSION}`],
    {
      user: NODE_USER,
    },
  )
  await sandbox.writeFile(COPILOT_SDK_RUNNER_PATH, getCopilotSdkRunnerScript())
  await sandbox.writeFile(
    COPILOT_SDK_RUNNER_CONFIG_PATH,
    JSON.stringify({
      copilotHome: COPILOT_DIR,
      model: model.name,
      prompt,
      reasoningEffort: model.reasoningEffort,
      timeoutMs: 60 * 60 * 1000,
    }),
  )
  const output = await sandbox.runCommand('node', [COPILOT_SDK_RUNNER_PATH, COPILOT_SDK_RUNNER_CONFIG_PATH], {
    user: NODE_USER,
    env: {
      COPILOT_GITHUB_TOKEN: copilotToken,
      NODE_PATH: path.posix.join(NPM_GLOBAL_DIR, 'lib/node_modules'),
    },
  })

  return output.stdout.split('\n').flatMap(line => {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      return []
    }
    return parseMessage(normalizeCopilotMessage(JSON.parse(trimmed)))
  })
}

export {getCopilotSdkRunnerScript, normalizeCopilotMessage, runCopilotSdk}
