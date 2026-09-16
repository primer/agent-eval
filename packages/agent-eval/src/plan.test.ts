import {setImmediate} from 'node:timers/promises'
import {afterEach, expect, test, vi} from 'vitest'
import {VirtualHost} from './host'
import {createPlanFromManifest, runPlan} from './plan'
import {VirtualSandbox} from './sandbox'
import {ControlTreatment} from './treatment'
import {runTrial} from './trial/run'
import type {Trial} from './trial/trial'
import type {SandboxCreateOptions} from './sandbox'

const runnerTrials: Array<Trial> = ['copilot-cli', 'copilot-sdk', 'legacy', 'copilot-sdk'].map((runner, index) => {
  return {
    id: String(index),
    scenario: {id: 'example', directory: '/scenario', prompt: 'Example', tags: [], checks: [], judges: []},
    model: {name: 'gpt-5.5', reasoningEffort: 'medium'},
    treatment: ControlTreatment,
    runner: runner === 'copilot-sdk' ? 'copilot-sdk' : runner === 'legacy' ? undefined : 'copilot-cli',
  }
})

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

test('builds each scenario image once per run and starts trials from the prepared images', async () => {
  const host = VirtualHost.create()
  const buildImage = vi.spyOn(host, 'buildSandboxImage')
  const createSandbox = vi.spyOn(host, 'createSandbox').mockImplementation(async () => {
    return VirtualSandbox.create()
  })
  const scenarios: Array<Trial['scenario']> = [
    {...runnerTrials[0].scenario},
    {...runnerTrials[0].scenario, workspace: {source: 'image', image: 'project:latest'}},
    {...runnerTrials[0].scenario, workspace: {source: 'image', dockerfile: './docker/Dockerfile'}},
    {...runnerTrials[0].scenario, workspace: {source: 'image', dockerfile: './Dockerfile', context: '..'}},
  ]
  const options = {
    artifactsDirectory: '/artifacts',
    copilotConcurrency: 1,
    containerConcurrency: 1,
    copilotToken: 'test-token',
    dockerImage: 'fallback:latest',
    host,
    plan: {
      trials: [...scenarios, scenarios[2]].map((scenario, index) => {
        return {...runnerTrials[0], id: String(index), scenario}
      }),
    },
  }

  await runPlan(options)

  const received: Array<SandboxCreateOptions | undefined> = buildImage.mock.calls.map(([createOptions]) => {
    return createOptions
  })
  expect(received).toEqual([
    {
      dockerImage: 'fallback:latest',
      scenario: {directory: '/scenario', exclude: expect.arrayContaining(['scenario.config.ts', 'node_modules'])},
    },
    {dockerImage: 'project:latest'},
    {dockerBuild: {dockerfile: '/scenario/docker/Dockerfile', context: '/scenario'}},
    {dockerBuild: {dockerfile: '/scenario/Dockerfile', context: '/'}},
  ])
  expect(createSandbox).toHaveBeenCalledTimes(5)
  expect(createSandbox.mock.calls[2][0]?.preparedImage).toBe(createSandbox.mock.calls[4][0]?.preparedImage)
  expect(createSandbox.mock.calls[0][0]?.preparedImage).not.toBe(createSandbox.mock.calls[1][0]?.preparedImage)

  await runPlan(options)
  expect(buildImage).toHaveBeenCalledTimes(8)
  expect(createSandbox.mock.calls[5][0]?.preparedImage).not.toBe(createSandbox.mock.calls[0][0]?.preparedImage)
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

  const trials: Array<Trial> = Array.from({length: 12}, (_, index) => {
    return {
      id: String(index),
      scenario: {id: 'example', directory: '/scenario', prompt: 'Example', tags: [], checks: [], judges: []},
      model: {name: 'gpt-5.5', reasoningEffort: 'medium'},
      treatment: ControlTreatment,
    }
  })
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
