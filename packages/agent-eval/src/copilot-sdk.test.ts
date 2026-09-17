import {runInNewContext} from 'node:vm'
import {expect, test, vi} from 'vitest'
import {getAgentSession} from './agent'
import {parseMessage} from './copilot-cli'
import {getCopilotSdkRunnerScript, normalizeCopilotMessage, runCopilotSdk} from './copilot-sdk'
import {COPILOT_DIR, NODE_USER, NPM_GLOBAL_DIR, VirtualSandbox} from './sandbox'

test('normalizes SDK messages for existing session parsing', () => {
  const message = parseMessage(
    normalizeCopilotMessage({
      type: 'assistant.message',
      id: 'message',
      timestamp: '2026-01-01T00:00:00.000Z',
      parentId: null,
      data: {messageId: 'assistant-message', content: 'Done', outputTokens: 42},
    }),
  )
  expect(message).toMatchObject({
    parentId: '',
    data: {
      content: 'Done',
      outputTokens: 42,
      toolRequests: [],
      interactionId: '',
      turnId: '',
      requestId: '',
    },
  })
})

test.each([true, false])('normalizes partial SDK tool results (success: %s)', success => {
  const message = parseMessage(
    normalizeCopilotMessage({
      type: 'tool.execution_complete',
      id: 'message',
      timestamp: '2026-01-01T00:00:00.000Z',
      parentId: null,
      data: {toolCallId: 'tool', success, ...(success ? {result: {content: 'Done'}} : {error: {message: 'Failed'}})},
    }),
  )
  expect(message).toMatchObject({
    data: success ? {result: {content: 'Done', detailedContent: ''}} : {error: {message: 'Failed', code: ''}},
  })
})

test.each([false, true])('executes the SDK script and surfaces failures (failed: %s)', async failed => {
  const config = {
    model: 'gpt-5.5',
    reasoningEffort: 'high',
    prompt: 'Build a page',
    copilotHome: COPILOT_DIR,
    timeoutMs: 1000,
  }
  const output: Array<string> = []
  const exit = vi.fn()
  const error = vi.fn()
  const sendAndWait = vi.fn(async () => {
    if (failed) {
      throw new Error('SDK request failed')
    }
  })
  const disconnect = vi.fn()
  const createSession = vi.fn(async () => {
    return {
      sessionId: 'session',
      on(callback: (event: object) => void) {
        callback({type: 'assistant.usage', data: {duration: 123}})
        callback({
          type: 'session.usage_checkpoint',
          id: 'checkpoint',
          timestamp: '2026-01-01T00:00:00.000Z',
          parentId: null,
          data: {totalNanoAiu: 2_839_800_000},
        })
        callback({
          type: 'assistant.message',
          id: 'message',
          timestamp: '2026-01-01T00:00:00.000Z',
          parentId: null,
          data: {messageId: 'assistant-message', content: 'Done', outputTokens: 42},
        })
      },
      sendAndWait,
      disconnect,
    }
  })
  const stop = vi.fn(async () => {
    return []
  })
  const clientOptions = vi.fn()
  const approveAll = vi.fn()
  class CopilotClient {
    constructor(options: unknown) {
      clientOptions(options)
    }
    async start() {
      return undefined
    }
    createSession = createSession
    stop = stop
  }
  await runInNewContext(getCopilotSdkRunnerScript(), {
    require(name: string) {
      if (name === '@github/copilot-sdk') {
        return {CopilotClient, approveAll}
      }
      if (name === 'node:fs/promises') {
        return {
          async readFile() {
            return JSON.stringify(config)
          },
        }
      }
      throw new Error(`Unexpected module: ${name}`)
    },
    console: {
      log(line: string) {
        output.push(line)
      },
      error,
    },
    process: {
      argv: ['node', 'runner', 'config'],
      env: {COPILOT_GITHUB_TOKEN: 'test-token'},
      cwd() {
        return '/workspace'
      },
      exit,
    },
  })
  expect(clientOptions).toHaveBeenCalledWith({
    workingDirectory: '/workspace',
    baseDirectory: COPILOT_DIR,
    gitHubToken: 'test-token',
    useLoggedInUser: false,
    logLevel: 'none',
  })
  expect(createSession).toHaveBeenCalledWith({
    model: config.model,
    reasoningEffort: 'high',
    onPermissionRequest: approveAll,
  })
  expect(sendAndWait).toHaveBeenCalledWith({prompt: config.prompt, agentMode: 'autopilot'}, 1000)
  expect(stop).toHaveBeenCalledOnce()
  if (failed) {
    expect(exit).toHaveBeenCalledWith(1)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('SDK request failed'))
    expect(
      output.some(line => {
        return JSON.parse(line).type === 'result'
      }),
    ).toBe(false)
  } else {
    expect(disconnect).toHaveBeenCalledOnce()
    expect(exit).not.toHaveBeenCalled()
    const messages = output.flatMap(line => {
      return parseMessage(normalizeCopilotMessage(JSON.parse(line)))
    })
    expect(getAgentSession(messages)).toMatchObject({outputTokens: 42, totalApiDurationMs: 123, aiCredits: 2.8398})
  }
})

test('allows only koffi install scripts when installing the SDK without writing the token to disk', async () => {
  await using sandbox = await VirtualSandbox.create()
  const runCommand = vi.spyOn(sandbox, 'runCommand').mockResolvedValue({stdout: '', stderr: '', exitCode: 0})
  const writeFile = vi.spyOn(sandbox, 'writeFile')
  await runCopilotSdk({
    sandbox,
    copilotToken: 'test-token',
    prompt: 'Build a page',
    model: {name: 'gpt-5.5', reasoningEffort: 'high'},
  })
  expect(runCommand).toHaveBeenNthCalledWith(
    1,
    'npm',
    ['install', '-g', '--allow-scripts=koffi', '@github/copilot-sdk@1.0.11'],
    {
      user: NODE_USER,
    },
  )
  expect(runCommand).toHaveBeenNthCalledWith(
    2,
    'node',
    ['/tmp/agent-eval-copilot-sdk-runner.cjs', '/tmp/agent-eval-copilot-sdk-runner-config.json'],
    {user: NODE_USER, env: {COPILOT_GITHUB_TOKEN: 'test-token', NODE_PATH: `${NPM_GLOBAL_DIR}/lib/node_modules`}},
  )
  for (const [, contents] of writeFile.mock.calls) {
    expect(contents).not.toContain('test-token')
  }
})
