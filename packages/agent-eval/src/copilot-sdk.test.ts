import {runInNewContext} from 'node:vm'
import {expect, test, vi} from 'vitest'
import {getAgentSession} from './agent'
import {parseMessage} from './copilot-cli'
import {getCopilotSdkRunnerScript, normalizeCopilotMessage, runCopilotSdk} from './copilot-sdk'
import {COPILOT_DIR, NODE_USER, VirtualSandbox} from './sandbox'

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
    prompt: ['Build a page', 'Add search', 'Handle empty results'],
    copilotHome: COPILOT_DIR,
    timeoutMs: 1000,
  }
  const output: Array<string> = []
  const exit = vi.fn()
  const error = vi.fn()
  const completed: Array<string> = []
  const sendAndWait = vi.fn(async ({prompt}: {prompt: string}) => {
    expect(prompt).toBe(config.prompt[completed.length])
    await Promise.resolve()
    if (failed && completed.length === 1) {
      throw new Error('SDK request failed')
    }
    completed.push(prompt)
  })
  const disconnect = vi.fn()
  const createSession = vi.fn(async () => {
    return {
      sessionId: 'session',
      on(callback: (event: object) => void) {
        callback({
          type: 'assistant.usage',
          id: 'usage',
          timestamp: '2026-01-01T00:00:00.000Z',
          parentId: null,
          ephemeral: true,
          data: {model: config.model, duration: 123, outputTokens: 42},
        })
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
          data: {messageId: 'assistant-message', content: 'Done'},
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
  expect(sendAndWait).toHaveBeenNthCalledWith(1, {prompt: config.prompt[0], agentMode: 'autopilot'}, 1000)
  expect(stop).toHaveBeenCalledOnce()
  if (failed) {
    expect(completed).toEqual(config.prompt.slice(0, 1))
    expect(sendAndWait).toHaveBeenCalledTimes(2)
    expect(exit).toHaveBeenCalledWith(1)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('SDK request failed'))
    expect(
      output.some(line => {
        return JSON.parse(line).type === 'result'
      }),
    ).toBe(false)
  } else {
    expect(completed).toEqual(config.prompt)
    expect(createSession).toHaveBeenCalledOnce()
    expect(sendAndWait).toHaveBeenCalledTimes(config.prompt.length)
    expect(sendAndWait).toHaveBeenNthCalledWith(2, {prompt: config.prompt[1], agentMode: 'autopilot'}, 1000)
    expect(sendAndWait).toHaveBeenNthCalledWith(3, {prompt: config.prompt[2], agentMode: 'autopilot'}, 1000)
    expect(disconnect).toHaveBeenCalledOnce()
    expect(exit).not.toHaveBeenCalled()
    const messages = output.flatMap(line => {
      return parseMessage(normalizeCopilotMessage(JSON.parse(line)))
    })
    expect(getAgentSession(messages)).toMatchObject({outputTokens: 42, totalApiDurationMs: 123, aiCredits: 2.8398})
  }
})

test('uses the bundled SDK runner and private Node without writing the token to disk', async () => {
  await using sandbox = await VirtualSandbox.create()
  const runCommand = vi.spyOn(sandbox, 'runCommand').mockResolvedValue({
    stdout: `\n${JSON.stringify({
      type: 'assistant.message',
      id: 'message',
      timestamp: '2026-01-01T00:00:00.000Z',
      parentId: null,
      data: {messageId: 'assistant-message', content: 'Done', outputTokens: 42},
    })}\n\n`,
    stderr: '',
    exitCode: 0,
  })
  const writeFile = vi.spyOn(sandbox, 'writeFile')
  const messages = await runCopilotSdk({
    sandbox,
    copilotToken: 'test-token',
    prompt: ['Build a page'],
    model: {name: 'gpt-5.5', reasoningEffort: 'high'},
  })
  expect(runCommand).toHaveBeenCalledExactlyOnceWith(
    '/opt/agent-eval/node/bin/node',
    ['/opt/agent-eval/sdk-runner/run.cjs', '/opt/agent-eval/sdk-runner/config.json'],
    {
      user: NODE_USER,
      env: {COPILOT_GITHUB_TOKEN: 'test-token'},
    },
  )
  expect(writeFile).toHaveBeenCalledExactlyOnceWith(
    '/opt/agent-eval/sdk-runner/config.json',
    JSON.stringify({
      copilotHome: COPILOT_DIR,
      model: 'gpt-5.5',
      prompt: ['Build a page'],
      reasoningEffort: 'high',
      timeoutMs: 60 * 60 * 1000,
    }),
  )
  for (const [, contents] of writeFile.mock.calls) {
    expect(contents).not.toContain('test-token')
  }
  expect(messages).toEqual([
    parseMessage(
      normalizeCopilotMessage({
        type: 'assistant.message',
        id: 'message',
        timestamp: '2026-01-01T00:00:00.000Z',
        parentId: null,
        data: {messageId: 'assistant-message', content: 'Done', outputTokens: 42},
      }),
    ),
  ])
})

test('propagates bundled runner failures', async () => {
  await using sandbox = await VirtualSandbox.create()
  const error = new Error('SDK runner failed')
  vi.spyOn(sandbox, 'runCommand').mockRejectedValue(error)
  await expect(
    runCopilotSdk({
      sandbox,
      copilotToken: 'test-token',
      prompt: ['Build a page'],
      model: {name: 'gpt-5.5', reasoningEffort: 'high'},
    }),
  ).rejects.toBe(error)
})
