import {setImmediate} from 'node:timers/promises'
import {afterEach, expect, test, vi} from 'vitest'
import {VirtualHost} from './host'
import {createPlanFromManifest, runPlan} from './plan'
import {VirtualSandbox} from './sandbox'
import {ControlTreatment} from './treatment'
import {runTrial} from './trial/run'
import type {Trial} from './trial/trial'

const runnerTrials: Array<Trial> = ['copilot-cli', 'copilot-sdk', 'legacy', 'copilot-sdk'].map((runner, index) => {
  return {
    id: String(index),
    scenario: {id: 'example', directory: '/scenario', prompt: 'Example', tags: [], checks: [], judges: []},
    model: {name: 'gpt-5.5', reasoningEffort: 'medium'},
    treatment: ControlTreatment,
    runner: runner === 'copilot-sdk' ? 'copilot-sdk' : runner === 'legacy' ? undefined : 'copilot-cli',
  }
})

function createTrial(id: string): Trial {
  return {
    id,
    scenario: {id: 'example', directory: '/scenario', prompt: 'Example', tags: [], checks: [], judges: []},
    model: {name: 'gpt-5.5', reasoningEffort: 'medium'},
    treatment: ControlTreatment,
  }
}

function createResult(trial: Trial) {
  return {
    trial,
    agent: {sessions: []},
    checks: [],
    judges: [],
    walkthrough: {type: 'Unavailable'} as const,
    artifacts: {
      directory: '/artifacts',
      copilotConfigDirectory: '/artifacts/copilot',
      skillsConfigDirectory: '/artifacts/skills',
      walkthroughDirectory: '/artifacts/walkthrough',
      workspaceDirectory: '/artifacts/workspace',
    },
  }
}

test.each([1, 2])('filters saved runners after assigning shard %s without changing trial IDs or order', order => {
  const shard = {order, total: 2}
  const expected = createPlanFromManifest({trials: runnerTrials, shard}).trials.filter(trial => {
    return trial.runner === 'copilot-sdk'
  })
  const plan = createPlanFromManifest({trials: runnerTrials, shard, runner: 'copilot-sdk'})
  expect(plan.trials).toEqual(expected)
  for (const trial of plan.trials) {
    expect(runnerTrials).toContain(trial)
  }
})

test('treats legacy trials as CLI when filtering a saved plan', () => {
  expect(createPlanFromManifest({trials: runnerTrials, runner: 'copilot-cli'}).trials).toEqual([
    runnerTrials[0],
    runnerTrials[2],
  ])
})

test('rejects a runner absent from a saved plan instead of rewriting trials', () => {
  expect(() => {
    createPlanFromManifest({trials: [runnerTrials[0]], runner: 'copilot-sdk'})
  }).toThrow('Create a new plan with --runner copilot-sdk')
  expect(runnerTrials[0].runner).toBe('copilot-cli')
})

vi.mock('./trial/run', () => {
  return {runTrial: vi.fn()}
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(runTrial).mockReset()
})

test.each([
  {copilotConcurrency: 1, containerConcurrency: 5},
  {copilotConcurrency: 3, containerConcurrency: 2},
  {copilotConcurrency: 2, containerConcurrency: 4},
  {copilotConcurrency: 6, containerConcurrency: 8},
])('limits actual Copilot and container work independently: %j', async concurrency => {
  const host = VirtualHost.create()
  let activeContainers = 0
  let peakContainers = 0
  let activeCopilot = 0
  let peakCopilot = 0

  vi.spyOn(host, 'createSandbox').mockImplementation(async () => {
    const sandbox = await VirtualSandbox.create()
    activeContainers += 1
    peakContainers = Math.max(peakContainers, activeContainers)
    vi.spyOn(sandbox, Symbol.asyncDispose).mockImplementation(async () => {
      activeContainers -= 1
    })
    return sandbox
  })
  vi.mocked(runTrial).mockImplementation(async ({copilotQueue, trial}) => {
    await copilotQueue.add(async () => {
      activeCopilot += 1
      peakCopilot = Math.max(peakCopilot, activeCopilot)
      await setImmediate()
      activeCopilot -= 1
    })
    return {
      trial,
      agent: {sessions: []},
      checks: [],
      judges: [],
      walkthrough: {type: 'Unavailable'},
      artifacts: {
        directory: '/artifacts',
        copilotConfigDirectory: '/artifacts/copilot',
        skillsConfigDirectory: '/artifacts/skills',
        walkthroughDirectory: '/artifacts/walkthrough',
        workspaceDirectory: '/artifacts/workspace',
      },
    }
  })

  const trials: Array<Trial> = Array.from({length: 12}, (_, index) => createTrial(String(index)))
  const result = await runPlan({
    ...concurrency,
    artifactsDirectory: '/artifacts',
    copilotToken: 'test-token',
    dockerImage: 'test-image',
    host,
    plan: createPlanFromManifest({trials}),
  })

  expect(peakContainers).toBe(concurrency.containerConcurrency)
  expect(peakCopilot).toBe(Math.min(concurrency.copilotConcurrency, concurrency.containerConcurrency))
  expect(activeContainers).toBe(0)
  expect(activeCopilot).toBe(0)
  expect(host.createSandbox).toHaveBeenCalledTimes(trials.length)
  expect(runTrial).toHaveBeenCalledTimes(trials.length)
  expect(
    result.results.map(({trial}) => {
      return trial.id
    }),
  ).toEqual(
    trials.map(trial => {
      return trial.id
    }),
  )
})

test('supports zero retries as one total attempt', async () => {
  const error = new Error('failure')
  vi.mocked(runTrial).mockRejectedValue(error)

  await expect(
    runPlan({
      artifactsDirectory: '/artifacts',
      copilotConcurrency: 1,
      containerConcurrency: 1,
      copilotToken: 'test-token',
      host: VirtualHost.create(),
      maxRetries: 0,
      plan: createPlanFromManifest({trials: [createTrial('one')]}),
    }),
  ).rejects.toBe(error)
  expect(runTrial).toHaveBeenCalledOnce()
})

test('uses configured retry count and reports each attempt to the trial', async () => {
  const trial = createTrial('one')
  vi.mocked(runTrial)
    .mockRejectedValueOnce(new Error('first'))
    .mockRejectedValueOnce(new Error('second'))
    .mockResolvedValueOnce(createResult(trial))

  await expect(
    runPlan({
      artifactsDirectory: '/artifacts',
      copilotConcurrency: 1,
      containerConcurrency: 1,
      copilotToken: 'test-token',
      host: VirtualHost.create(),
      maxRetries: 2,
      plan: createPlanFromManifest({trials: [trial]}),
    }),
  ).resolves.toMatchObject({results: [{trial}]})
  expect(vi.mocked(runTrial).mock.calls.map(([options]) => options.attempt)).toEqual([
    {maxRetries: 2, number: 1},
    {maxRetries: 2, number: 2},
    {maxRetries: 2, number: 3},
  ])
})

test('forwards prepared-image and trial execution options', async () => {
  const trial = createTrial('one')
  const host = VirtualHost.create()
  const createSandbox = vi.spyOn(host, 'createSandbox')
  const preparedImage = `sha256:${'a'.repeat(64)}`
  const execution = {
    captureWalkthrough: false,
    installDependencies: false,
    timeoutMs: 1_000,
  }
  vi.mocked(runTrial).mockResolvedValue(createResult(trial))

  await runPlan({
    artifactsDirectory: '/artifacts',
    copilotConcurrency: 1,
    containerConcurrency: 1,
    copilotToken: 'test-token',
    execution,
    host,
    maxRetries: 0,
    plan: createPlanFromManifest({trials: [trial]}),
    preparedImage,
  })

  expect(createSandbox).toHaveBeenCalledWith({preparedImage})
  expect(runTrial).toHaveBeenCalledWith(
    expect.objectContaining({
      attempt: {maxRetries: 0, number: 1},
      execution,
    }),
  )
})

test('rejects conflicting or invalid execution controls before creating a sandbox', async () => {
  const host = VirtualHost.create()
  const createSandbox = vi.spyOn(host, 'createSandbox')
  const plan = createPlanFromManifest({trials: [createTrial('one')]})

  await expect(
    runPlan({
      artifactsDirectory: '/artifacts',
      copilotConcurrency: 1,
      containerConcurrency: 1,
      copilotToken: 'test-token',
      dockerImage: 'node:26',
      host,
      maxRetries: 0,
      plan,
      preparedImage: `sha256:${'a'.repeat(64)}`,
    }),
  ).rejects.toThrow('preparedImage cannot be combined with dockerImage')
  await expect(
    runPlan({
      artifactsDirectory: '/artifacts',
      copilotConcurrency: 1,
      containerConcurrency: 1,
      copilotToken: 'test-token',
      host,
      maxRetries: -1,
      plan,
    }),
  ).rejects.toThrow('maxRetries must be a non-negative safe integer')
  expect(createSandbox).not.toHaveBeenCalled()
})
