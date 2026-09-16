import {setImmediate} from 'node:timers/promises'
import {afterEach, expect, test, vi} from 'vitest'
import {VirtualHost} from './host'
import {createPlanFromManifest, runPlan} from './plan'
import {VirtualSandbox} from './sandbox'
import {ControlTreatment} from './treatment'
import {runTrial} from './trial/run'
import type {Trial} from './trial/trial'

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
