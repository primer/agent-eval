import {afterEach, describe, expect, test, vi} from 'vitest'
import {VirtualHost} from './host'
import {create, run} from './plan'
import {run as runTrial} from './trial'
import type {Trial, TrialResult} from './trial'

vi.mock('./trial', async importOriginal => {
  const original = await importOriginal<typeof import('./trial')>()
  return {
    ...original,
    run: vi.fn(),
  }
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

function createTrial(id: string): Trial {
  return {
    id,
    scenario: {
      id: 'scenario',
      directory: '/scenario',
      prompt: 'prompt',
      tags: [],
      testPath: '/scenario/scenario.test.ts',
    },
    treatment: {
      name: 'Control',
    },
    model: {
      name: 'gpt-5.6-sol',
      reasoningEffort: 'medium',
    },
  }
}

function createResult(trial: Trial): TrialResult {
  return {
    artifacts: {
      directory: '/artifacts',
      copilotConfigDirectory: '/artifacts/.copilot',
      skillsConfigDirectory: '/artifacts/.agents',
      testResultsPath: '/artifacts/test-results.json',
      workspaceDirectory: '/artifacts/workspace',
    },
    trial,
    agent: {
      sessions: [],
    },
    testResults: {
      numTotalTests: 0,
      numPassedTests: 0,
      numFailedTests: 0,
      numPendingTests: 0,
      numTodoTests: 0,
      success: true,
      testResults: [],
    },
    walkthrough: {
      type: 'Unavailable',
    },
  }
}

describe('create', () => {
  test('randomizes trials without mutating the input', async () => {
    const trials = [createTrial('one'), createTrial('two'), createTrial('three')]
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0)

    const plan = await create(trials)

    expect(plan.trials.map(trial => trial.id)).toEqual(['two', 'three', 'one'])
    expect(trials.map(trial => trial.id)).toEqual(['one', 'two', 'three'])
  })
})

describe('run', () => {
  test('runs each trial and returns results in plan order', async () => {
    const trials = [createTrial('one'), createTrial('two')]
    const results = trials.map(createResult)
    const host = VirtualHost.create()
    vi.mocked(runTrial).mockImplementation(async ({trial}) => {
      return createResult(trial)
    })

    await expect(
      run({
        env: {
          artifactsDirectory: '/artifacts',
          benchmarksDirectory: '/benchmarks',
          concurrency: 2,
          copilotToken: 'token',
          dockerImage: 'node:test',
          experimentsDirectory: '/experiments',
          outputPath: '/output.json',
          scenariosDirectory: '/scenarios',
        },
        host,
        plan: {
          trials,
        },
      }),
    ).resolves.toEqual(results)
    expect(runTrial).toHaveBeenCalledTimes(2)
  })

  test('retries a failed trial three times', async () => {
    const trial = createTrial('one')
    const result = createResult(trial)
    const host = VirtualHost.create()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.mocked(runTrial)
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'))
      .mockRejectedValueOnce(new Error('third'))
      .mockResolvedValueOnce(result)

    await expect(
      run({
        env: {
          artifactsDirectory: '/artifacts',
          benchmarksDirectory: '/benchmarks',
          concurrency: 1,
          copilotToken: 'token',
          dockerImage: 'node:test',
          experimentsDirectory: '/experiments',
          outputPath: '/output.json',
          scenariosDirectory: '/scenarios',
        },
        host,
        plan: {
          trials: [trial],
        },
      }),
    ).resolves.toEqual([result])
    expect(runTrial).toHaveBeenCalledTimes(4)
  })

  test('throws after all retry attempts fail', async () => {
    const host = VirtualHost.create()
    const error = new Error('failure')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.mocked(runTrial).mockRejectedValue(error)

    await expect(
      run({
        env: {
          artifactsDirectory: '/artifacts',
          benchmarksDirectory: '/benchmarks',
          concurrency: 1,
          copilotToken: 'token',
          dockerImage: 'node:test',
          experimentsDirectory: '/experiments',
          outputPath: '/output.json',
          scenariosDirectory: '/scenarios',
        },
        host,
        plan: {
          trials: [createTrial('one')],
        },
      }),
    ).rejects.toBe(error)
    expect(runTrial).toHaveBeenCalledTimes(4)
  })
})
