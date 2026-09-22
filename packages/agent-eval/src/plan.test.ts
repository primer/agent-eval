import {beforeEach, expect, test, vi} from 'vitest'
import {VirtualHost} from './host'
import {createPlanFromManifest, runPlan, type PlanProgress} from './plan'
import {buildScenarioImage} from './scenario/scenario'
import {ControlTreatment} from './treatment'
import {runTrial, type RunTrialResult} from './trial/run'
import type {Trial} from './trial/trial'

vi.mock('./scenario/scenario', () => ({
  buildScenarioImage: vi.fn(),
}))
vi.mock('./trial/run', () => ({
  runTrial: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(buildScenarioImage).mockReset().mockResolvedValue({tagName: 'test-image'})
  vi.mocked(runTrial)
    .mockReset()
    .mockImplementation(async ({trial}) => resultFor(trial))
})

test('runPlan reports active trials rather than queued trials and completes each once', async () => {
  const trials = [createTrial('one'), createTrial('two'), createTrial('three')]
  const updates: Array<PlanProgress> = []
  const started = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let active = 0
  vi.mocked(runTrial).mockImplementation(async ({trial}) => {
    if (++active === 2) {
      started.resolve()
    }
    await release.promise
    return resultFor(trial)
  })

  const run = runPlan({
    ...options(),
    plan: {trials},
    onProgress: progress => updates.push(progress),
  })
  await started.promise
  const initialUpdates = updates.slice()
  release.resolve()
  const result = await run

  expect(initialUpdates).toEqual([
    {total: 3, completed: 0, inFlight: 0},
    {total: 3, completed: 0, inFlight: 1},
    {total: 3, completed: 0, inFlight: 2},
  ])
  expect(updates.every(progress => progress.inFlight >= 0 && progress.inFlight <= 2)).toBe(true)
  expect(updates.map(progress => progress.completed)).toContain(1)
  expect(updates.map(progress => progress.completed)).toContain(2)
  expect(updates.at(-1)).toEqual({total: 3, completed: 3, inFlight: 0})
  expect(result.results.map(entry => entry.trial)).toEqual(trials)
})

test('runPlan counts image preparation as in flight and retries without completing extra trials', async () => {
  const updates: Array<PlanProgress> = []
  vi.mocked(buildScenarioImage).mockRejectedValueOnce(new Error('image build failed'))

  await runPlan({
    ...options(),
    plan: {trials: [createTrial('one')]},
    onProgress: progress => updates.push(progress),
  })

  expect(updates).toEqual([
    {total: 1, completed: 0, inFlight: 0},
    {total: 1, completed: 0, inFlight: 1},
    {total: 1, completed: 0, inFlight: 0},
    {total: 1, completed: 0, inFlight: 1},
    {total: 1, completed: 0, inFlight: 0},
    {total: 1, completed: 1, inFlight: 0},
  ])
})

test('runPlan releases in-flight counts on exhausted retries without reporting completion', async () => {
  const updates: Array<PlanProgress> = []
  vi.mocked(runTrial).mockRejectedValue(new Error('trial failed'))

  await expect(
    runPlan({
      ...options(),
      plan: {trials: [createTrial('one')]},
      onProgress: progress => updates.push(progress),
    }),
  ).rejects.toThrow('trial failed')

  expect(updates.every(progress => progress.completed === 0)).toBe(true)
  expect(updates.at(-1)).toEqual({total: 1, completed: 0, inFlight: 0})
})

test('runPlan reports only selected trials and handles an empty shard', async () => {
  const trials = [createTrial('one'), createTrial('two'), createTrial('three')]
  const updates: Array<PlanProgress> = []
  const plan = createPlanFromManifest({trials, shard: {order: 2, total: 2}})

  await runPlan({...options(), plan, onProgress: progress => updates.push(progress)})
  expect(updates.at(-1)).toEqual({total: 1, completed: 1, inFlight: 0})

  updates.length = 0
  const emptyPlan = createPlanFromManifest({trials, shard: {order: 4, total: 4}})
  const result = await runPlan({...options(), plan: emptyPlan, onProgress: progress => updates.push(progress)})

  expect(updates).toEqual([{total: 0, completed: 0, inFlight: 0}])
  expect(result.results).toEqual([])
})

test('runPlan still returns results when no progress callback is supplied', async () => {
  const trial = createTrial('one')

  const result = await runPlan({...options(), plan: {trials: [trial]}})

  expect(result.results).toEqual([{trial, result: resultFor(trial)}])
})

function options() {
  return {
    artifactsDirectory: '/artifacts',
    copilotConcurrency: 1,
    containerConcurrency: 2,
    copilotToken: 'test-token',
    host: VirtualHost.create(),
  }
}

function createTrial(id: string): Trial {
  return {
    id,
    model: {name: 'gpt-5.5', reasoningEffort: 'high'},
    treatment: ControlTreatment,
    scenario: {
      id: 'example',
      directory: '/scenarios/example',
      prompt: 'Update the example',
      tags: [],
      checks: [],
      judges: [],
      image: {type: 'Default'},
    },
  }
}

function resultFor(trial: Trial): RunTrialResult {
  return {
    trial,
    agent: {sessions: []},
    artifacts: {
      directory: `/artifacts/${trial.id}`,
      copilotConfigDirectory: '',
      skillsConfigDirectory: '',
      walkthroughDirectory: '',
      workspaceDirectory: '',
    },
    checks: [],
    judges: [],
    walkthrough: {type: 'Unavailable'},
  }
}
