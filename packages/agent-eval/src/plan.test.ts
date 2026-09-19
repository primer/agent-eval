import {afterEach, expect, test, vi} from 'vitest'
import {VirtualHost} from './host'
import {assertPlanSucceeded, runPlan} from './plan'
import {buildScenarioImage} from './scenario/scenario'
import {ControlTreatment} from './treatment'
import {runTrial, type RunTrialResult} from './trial/run'
import type {Trial} from './trial/trial'

vi.mock('./trial/run', async importOriginal => {
  return {...(await importOriginal<typeof import('./trial/run')>()), runTrial: vi.fn()}
})
vi.mock('./scenario/scenario', async importOriginal => {
  return {...(await importOriginal<typeof import('./scenario/scenario')>()), buildScenarioImage: vi.fn()}
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetAllMocks()
})

const trial: Trial = {
  id: 'trial',
  model: {name: 'gpt-5.5', reasoningEffort: 'high'},
  treatment: ControlTreatment,
  scenario: {
    id: 'example',
    directory: '/scenarios/example',
    prompt: 'Update the example',
    tags: [],
    judges: [],
    checks: [],
    image: {type: 'Default'},
  },
}

function setup() {
  const host = VirtualHost.create()
  const result: RunTrialResult = {
    trial,
    agent: {sessions: []},
    checks: [],
    judges: [],
    walkthrough: {type: 'Unavailable'},
    artifacts: {
      directory: '/artifacts/trial',
      copilotConfigDirectory: '/artifacts/trial/copilot',
      skillsConfigDirectory: '/artifacts/trial/skills',
      walkthroughDirectory: '/artifacts/trial/walkthrough',
      workspaceDirectory: '/artifacts/trial/workspace',
    },
  }
  vi.mocked(buildScenarioImage).mockResolvedValue({tagName: 'example'})
  vi.mocked(runTrial).mockResolvedValue(result)
  return {
    host,
    result,
    options: {
      host,
      artifactsDirectory: '/artifacts',
      copilotConcurrency: 1,
      containerConcurrency: 1,
      copilotToken: 'test',
      plan: {trials: [trial]},
    },
  }
}

test('persists a completed trial before disposal and never reruns it for a cleanup failure', async () => {
  const {host, options, result} = setup()
  const sandbox = await host.createSandbox()
  vi.spyOn(host, 'createSandbox').mockResolvedValue(sandbox)
  vi.spyOn(sandbox, Symbol.asyncDispose).mockImplementation(async () => {
    expect(JSON.parse(await host.fs.readFile('/artifacts/trial/trial-result.json', 'utf-8'))).toEqual(result)
    throw new Error('Docker unavailable')
  })

  const output = await runPlan(options)
  expect(output.results).toEqual([{trial, result}])
  expect(output.errors).toHaveLength(1)
  expect(runTrial).toHaveBeenCalledTimes(1)
  expect(() => {
    assertPlanSucceeded(output)
  }).toThrow('completed results were saved')
})

test('retries execution failures only after disposing the failed sandbox', async () => {
  const {host, options} = setup()
  const sandbox = await host.createSandbox()
  vi.spyOn(host, 'createSandbox').mockResolvedValue(sandbox)
  const dispose = vi.spyOn(sandbox, Symbol.asyncDispose)
  vi.mocked(runTrial).mockRejectedValueOnce(new Error('Agent failed'))
  const output = await runPlan(options)
  expect(output.errors).toEqual([])
  expect(output.results).toHaveLength(1)
  expect(runTrial).toHaveBeenCalledTimes(2)
  expect(dispose).toHaveBeenCalledTimes(2)
  expect(dispose.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(runTrial).mock.invocationCallOrder[1])
})

test('preserves both errors and stops retrying when execution and cleanup fail', async () => {
  const {host, options} = setup()
  const sandbox = await host.createSandbox()
  vi.spyOn(host, 'createSandbox').mockResolvedValue(sandbox)
  vi.spyOn(sandbox, Symbol.asyncDispose).mockRejectedValue(new Error('Cleanup failed'))
  vi.mocked(runTrial).mockRejectedValue(new Error('Execution failed'))
  const output = await runPlan(options)
  expect(output.results).toEqual([])
  expect(output.errors).toHaveLength(2)
  expect(runTrial).toHaveBeenCalledTimes(1)
})

test('does not rerun a completed trial when persisting its result fails', async () => {
  const {host, options} = setup()
  const sandbox = await host.createSandbox()
  vi.spyOn(host, 'createSandbox').mockResolvedValue(sandbox)
  const dispose = vi.spyOn(sandbox, Symbol.asyncDispose)
  vi.spyOn(host.fs, 'writeFile').mockRejectedValue(new Error('Disk full'))
  const output = await runPlan(options)
  expect(output.errors).toHaveLength(1)
  expect(runTrial).toHaveBeenCalledTimes(1)
  expect(dispose).toHaveBeenCalledTimes(1)
})
