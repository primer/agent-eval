import {runCommand} from 'citty'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {getBenchmark} from '../benchmark/get'
import {getExperiment} from '../experiment/get'
import {getScenario} from '../scenario/get'
import {DefaultHost} from '../host'
import {runPlan} from '../plan'
import {ControlTreatment} from '../treatment'
import {benchmark} from './commands/benchmark'
import {experiment} from './commands/experiment'
import {scenario} from './commands/scenario'

vi.mock('../plan', async importOriginal => {
  return {...(await importOriginal<typeof import('../plan')>()), runPlan: vi.fn()}
})
vi.mock('../benchmark/get', () => {
  return {getBenchmark: vi.fn()}
})
vi.mock('../experiment/get', () => {
  return {getExperiment: vi.fn()}
})
vi.mock('../scenario/get', () => {
  return {getScenario: vi.fn()}
})

const stopBeforeRunning = new Error('Stop before creating containers')
const model = {name: 'gpt-5.5', reasoningEffort: 'medium'} as const
const exampleScenario = {
  id: 'example',
  directory: '/scenarios/example',
  prompt: 'Example',
  tags: [],
  checks: [],
  judges: [],
}

beforeEach(() => {
  vi.mocked(getBenchmark).mockResolvedValue({
    id: 'example',
    name: 'Example',
    description: 'Example',
    filepath: '/benchmarks/example.ts',
    models: [model],
    capabilities: [{id: 'capability', name: 'Capability', scenarios: [exampleScenario]}],
  })
  vi.mocked(getExperiment).mockResolvedValue({
    id: 'example',
    name: 'Example',
    description: 'Example',
    filepath: '/experiments/example.ts',
    models: [model],
    scenarios: [exampleScenario],
    treatments: [],
    runners: ['copilot-cli', 'copilot-sdk'],
  })
  vi.mocked(getScenario).mockResolvedValue(exampleScenario)
  vi.mocked(runPlan).mockRejectedValue(stopBeforeRunning)
  vi.spyOn(DefaultHost, 'existsSync').mockReturnValue(true)
  vi.spyOn(DefaultHost.fs, 'mkdir').mockResolvedValue(undefined)
  vi.spyOn(DefaultHost.fs, 'writeFile').mockResolvedValue(undefined)
  vi.spyOn(DefaultHost.fs, 'readFile').mockResolvedValue(
    JSON.stringify({
      id: 'example',
      name: 'Example',
      trials: ['copilot-cli', 'copilot-sdk'].map(runner => {
        return {
          id: runner,
          runner,
          capabilityId: 'capability',
          scenarioId: 'example',
          treatmentId: ControlTreatment.id,
          model,
        }
      }),
    }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe.each([
  {name: 'benchmark run', command: benchmark, args: ['run', 'example']},
  {name: 'experiment run', command: experiment, args: ['run', 'example']},
  {name: 'scenario run', command: scenario, args: ['run', 'example']},
  {name: 'benchmark plan run', command: benchmark, args: ['plan', 'run']},
  {name: 'experiment plan run', command: experiment, args: ['plan', 'run']},
])('$name runner selection', ({name, command, args}) => {
  test.each(['copilot-cli', 'copilot-sdk'] as const)('selects %s', async runner => {
    await expect(runCommand(command, {rawArgs: [...args, '--token', 'test-token', '--runner', runner]})).rejects.toBe(
      stopBeforeRunning,
    )
    const {plan} = vi.mocked(runPlan).mock.calls[0][0]
    expect(plan.trials).toHaveLength(name === 'benchmark run' ? 2 : 1)
    expect(
      new Set(
        plan.trials.map(trial => {
          return trial.runner
        }),
      ),
    ).toEqual(new Set([runner]))
  })

  test('preserves defaults and configured runners when omitted', async () => {
    await expect(runCommand(command, {rawArgs: [...args, '--token', 'test-token']})).rejects.toBe(stopBeforeRunning)
    const {plan} = vi.mocked(runPlan).mock.calls[0][0]
    expect(
      new Set(
        plan.trials.map(trial => {
          return trial.runner
        }),
      ),
    ).toEqual(
      new Set(
        name.startsWith('experiment') || name.includes('plan run') ? ['copilot-cli', 'copilot-sdk'] : ['copilot-cli'],
      ),
    )
  })

  test.each(['sdk', 'unknown', ''])('rejects invalid runner %j before starting work', async runner => {
    await expect(
      runCommand(command, {rawArgs: [...args, '--token', 'test-token', '--runner', runner]}),
    ).rejects.toThrow()
    expect(runPlan).not.toHaveBeenCalled()
    expect(getBenchmark).not.toHaveBeenCalled()
    expect(getExperiment).not.toHaveBeenCalled()
    expect(getScenario).not.toHaveBeenCalled()
  })
})

describe.each([
  {name: 'benchmark', command: benchmark},
  {name: 'experiment', command: experiment},
])('$name plan create runner selection', ({command}) => {
  test.each(['copilot-cli', 'copilot-sdk'])('saves %s in every planned trial', async runner => {
    await runCommand(command, {rawArgs: ['plan', 'create', 'example', '--runner', runner]})
    const contents = vi.mocked(DefaultHost.fs.writeFile).mock.calls[0][1]
    const manifest = JSON.parse(String(contents))
    expect(manifest.trials.length).toBeGreaterThan(0)
    expect(
      manifest.trials.every((trial: {runner: string}) => {
        return trial.runner === runner
      }),
    ).toBe(true)
  })

  test('rejects an invalid runner before writing a plan', async () => {
    await expect(runCommand(command, {rawArgs: ['plan', 'create', 'example', '--runner', 'unknown']})).rejects.toThrow()
    expect(DefaultHost.fs.writeFile).not.toHaveBeenCalled()
  })
})
