import {afterEach, expect, test, vi} from 'vitest'
import type {CopilotRunner} from './copilot-runner'
import {VirtualHost} from './host'
import {runPlan, selectPlanTrials} from './plan'
import {AGENTS_DIR, COPILOT_DIR, VirtualSandbox, type Sandbox} from './sandbox'
import * as scenarioModule from './scenario/scenario'
import {ControlTreatment} from './treatment'
import type {Trial} from './trial/trial'

afterEach(() => {
  vi.restoreAllMocks()
})

function createRunTrial(id = 'trial'): Trial {
  return {
    id,
    runner: 'copilot-cli',
    model: {
      name: 'gpt-5.5',
      reasoningEffort: 'high',
    },
    treatment: ControlTreatment,
    scenario: {
      id: 'example',
      directory: '/scenarios/example',
      prompt: 'Update the example',
      tags: [],
      checks: [],
      judges: [],
      image: {
        type: 'Default',
      },
    },
  }
}

function createRunHost() {
  const host = VirtualHost.create({
    '/home/sandbox/workspace/package.json': '{}',
    [`${COPILOT_DIR}/config.json`]: '{}',
    [`${AGENTS_DIR}/config.json`]: '{}',
  })
  const sandboxes: Array<Sandbox> = []
  vi.spyOn(scenarioModule, 'buildScenarioImage').mockResolvedValue({
    tagName: 'test-image',
  })
  vi.spyOn(host, 'createSandbox').mockImplementation(async () => {
    const sandbox: Sandbox = await VirtualSandbox.create({host})
    sandboxes.push(sandbox)
    vi.spyOn(sandbox, Symbol.asyncDispose)
    vi.spyOn(sandbox, 'runCommand').mockImplementation(async (_command, args = []) => {
      const usageIndex = args.indexOf('--usage-output-file')
      if (usageIndex !== -1) {
        await sandbox.writeFile(args[usageIndex + 1], JSON.stringify({modelMetrics: {}}))
      }
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          type: 'result',
          timestamp: '2026-09-15T00:00:00.000Z',
          sessionId: 'session',
          exitCode: 0,
          usage: {
            premiumRequests: 0,
            totalApiDurationMs: 0,
            sessionDurationMs: 0,
            codeChanges: {
              linesAdded: 0,
              linesRemoved: 0,
              filesModified: [],
            },
          },
        }),
      }
    })
    return sandbox
  })
  return {host, sandboxes}
}

function createTrials() {
  const runners: Array<CopilotRunner> = ['copilot-cli', 'copilot-sdk', 'copilot-sdk', 'copilot-cli']
  return runners.map((runner, index) => {
    return {
      id: `trial-${index}`,
      runner,
    }
  })
}

test('selectPlanTrials preserves every runner and saved trial order by default', () => {
  const trials = createTrials()

  const selected = selectPlanTrials({
    trials,
  })

  expect(selected).toEqual(trials)
})

test('selectPlanTrials selects a runner without changing trial order', () => {
  const trials = createTrials()

  const selected = selectPlanTrials({
    trials,
    runner: 'copilot-sdk',
  })

  expect(selected).toEqual([trials[1], trials[2]])
})

test('selectPlanTrials selects a shard across all runners', () => {
  const trials = createTrials()

  const selected = selectPlanTrials({
    trials,
    shard: {
      order: 1,
      total: 2,
    },
  })

  expect(selected).toEqual([trials[0], trials[2]])
})

test('selectPlanTrials assigns shards before filtering by runner', () => {
  const trials = createTrials()

  const selected = selectPlanTrials({
    trials,
    runner: 'copilot-sdk',
    shard: {
      order: 1,
      total: 2,
    },
  })

  expect(selected).toEqual([trials[2]])
})

test('selectPlanTrials allows a shard without trials for a runner present in the full plan', () => {
  const trials = createTrials()

  const selected = selectPlanTrials({
    trials,
    runner: 'copilot-sdk',
    shard: {
      order: 1,
      total: 4,
    },
  })

  expect(selected).toEqual([])
})

test('selectPlanTrials rejects a runner absent from the full plan, even when the shard is empty', () => {
  const trials = createTrials().filter(trial => {
    return trial.runner === 'copilot-cli'
  })

  expect(() => {
    selectPlanTrials({
      trials,
      runner: 'copilot-sdk',
      shard: {
        order: 4,
        total: 4,
      },
    })
  }).toThrow(
    'No trials found for runner "copilot-sdk" in the saved plan. Add "copilot-sdk" to the configuration\'s runners and create a new plan.',
  )
})

test('runPlan retries a failed stage in a fresh sandbox and returns a later success', async () => {
  const {host, sandboxes} = createRunHost()
  const trial = createRunTrial()
  let attempts = 0
  trial.scenario.setup = async () => {
    attempts += 1
    if (attempts === 1) {
      throw new Error('Temporary setup failure')
    }
  }

  const {results} = await runPlan({
    artifactsDirectory: '/artifacts',
    copilotConcurrency: 1,
    containerConcurrency: 1,
    copilotToken: 'test-token',
    host,
    plan: {trials: [trial]},
  })

  expect(results).toMatchObject([{trial, result: {type: 'success'}}])
  expect(sandboxes).toHaveLength(2)
  for (const sandbox of sandboxes) {
    expect(sandbox[Symbol.asyncDispose]).toHaveBeenCalledOnce()
  }
})

test.each(['stage', 'image', 'sandbox', 'cleanup'] as const)(
  'runPlan returns a final %s failure after four attempts',
  async failure => {
    const {host, sandboxes} = createRunHost()
    const trial = createRunTrial()
    const error = new TypeError(`${failure} failed`)
    let attempts = 0
    if (failure === 'image') {
      vi.mocked(scenarioModule.buildScenarioImage).mockImplementation(async () => {
        attempts += 1
        throw error
      })
    } else if (failure === 'sandbox') {
      vi.mocked(host.createSandbox).mockImplementation(async () => {
        attempts += 1
        throw error
      })
    } else {
      trial.scenario.setup = async ({sandbox}) => {
        attempts += 1
        if (failure === 'stage') {
          throw error
        }
        vi.mocked(sandbox[Symbol.asyncDispose]).mockRejectedValue(error)
      }
    }

    const {results} = await runPlan({
      artifactsDirectory: '/artifacts',
      copilotConcurrency: 1,
      containerConcurrency: 1,
      copilotToken: 'test-token',
      host,
      plan: {trials: [trial]},
    })

    expect(attempts).toBe(4)
    expect(results).toEqual([
      {
        trial,
        result: {
          type: 'error',
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
        },
      },
    ])
    for (const sandbox of sandboxes) {
      expect(sandbox[Symbol.asyncDispose]).toHaveBeenCalledOnce()
    }
  },
)

test('runPlan preserves successful neighboring trials when another trial exhausts retries', async () => {
  const {host} = createRunHost()
  const failed = createRunTrial('failed')
  failed.scenario.setup = async () => {
    throw new Error('Setup failed')
  }
  const succeeded = createRunTrial('succeeded')

  const {results} = await runPlan({
    artifactsDirectory: '/artifacts',
    copilotConcurrency: 1,
    containerConcurrency: 1,
    copilotToken: 'test-token',
    host,
    plan: {trials: [failed, succeeded]},
  })

  expect(
    results.map(({trial, result}) => {
      return {id: trial.id, type: result.type}
    }),
  ).toEqual([
    {id: 'failed', type: 'error'},
    {id: 'succeeded', type: 'success'},
  ])
  await expect(host.fs.promises.stat('/artifacts/succeeded/workspace')).resolves.toBeDefined()
})
