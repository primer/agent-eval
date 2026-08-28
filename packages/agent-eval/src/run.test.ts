import {test, expect, vi} from 'vitest'
import {run, runTrial} from './run'
import {plan} from './plan'
import {VirtualHost} from './host'

vi.mock(import('./sandbox'), async importOriginal => {
  const actual = await importOriginal()

  class MockSandbox extends actual.Sandbox {
    constructor() {
      super(undefined as never, undefined as never)
    }

    static async create() {
      return new MockSandbox()
    }

    async [Symbol.asyncDispose]() {}

    copy = vi.fn()
    download = vi.fn()
    readFile = vi.fn()
    writeFile = vi.fn()
    exists = vi.fn()
    addAgentInstruction = vi.fn()
    addAgentSkill = vi.fn()
    addCustomAgent = vi.fn()
    addMcpServer = vi.fn()
    addCopilotPlugin = vi.fn()
    runCommand = vi.fn().mockImplementation(async () => {
      return {
        stdout: '',
        stderr: '',
        exitCode: 0,
      }
    })
  }

  return {
    ...actual,
    Sandbox: MockSandbox,
  }
})

test('hello', async () => {
  const host = new VirtualHost()
  const results = await run(host, await plan([]), {
    artifactsDirectory: 'test',
    copilotToken: 'test',
    maxConcurrency: 1,
  })
})

test('runTrial', async () => {
  const host = new VirtualHost()
  const result = await runTrial(
    host,
    {
      id: 'test',
      scenario: {
        id: 'test',
        directory: 'test',
        prompt: 'test',
        tags: [],
        testPath: 'test',
      },
      treatment: {
        name: 'test',
      },
      model: {
        name: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
      },
    },
    {
      artifactsDirectory: '',
      copilotToken: '',
    },
  )
})
