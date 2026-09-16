import {runCommand} from 'citty'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {getBenchmark} from '../benchmark/get'
import {getExperiment} from '../experiment/get'
import {getScenario} from '../scenario/get'
import {DefaultHost} from '../host'
import {logger} from '../logger'
import {runPlan} from '../plan'
import {benchmark} from './commands/benchmark'
import {experiment} from './commands/experiment'
import {scenario} from './commands/scenario'
import {getConcurrencyValue} from './options'

vi.mock('../plan', async importOriginal => {
  const original = await importOriginal<typeof import('../plan')>()
  return {...original, runPlan: vi.fn()}
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

beforeEach(() => {
  vi.spyOn(logger, 'info').mockImplementation(() => {
    return undefined
  })
  vi.spyOn(logger, 'debug').mockImplementation(() => {
    return undefined
  })
  vi.spyOn(DefaultHost, 'existsSync').mockReturnValue(true)
  vi.spyOn(DefaultHost.fs, 'readFile').mockResolvedValue(JSON.stringify({id: 'example', name: 'Example', trials: []}))
  vi.mocked(getBenchmark).mockResolvedValue({
    id: 'example',
    name: 'Example',
    description: 'Example benchmark',
    filepath: '/benchmarks/example.ts',
    models: [],
    capabilities: [],
  })
  vi.mocked(getExperiment).mockResolvedValue({
    id: 'example',
    name: 'Example',
    description: 'Example experiment',
    filepath: '/experiments/example.ts',
    models: [],
    scenarios: [],
    treatments: [],
  })
  vi.mocked(getScenario).mockResolvedValue({
    id: 'example',
    directory: '/scenarios/example',
    prompt: 'Example',
    tags: [],
    checks: [],
    judges: [],
  })
  vi.mocked(runPlan).mockRejectedValue(stopBeforeRunning)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe.each([
  {name: 'benchmark run', command: benchmark, args: ['run', 'example']},
  {name: 'benchmark plan run', command: benchmark, args: ['plan', 'run']},
  {name: 'experiment run', command: experiment, args: ['run', 'example']},
  {name: 'experiment plan run', command: experiment, args: ['plan', 'run']},
  {name: 'scenario run', command: scenario, args: ['run', 'example']},
])('$name', ({command, args}) => {
  test.each([
    {flags: [], copilotConcurrency: 1, containerConcurrency: 5},
    {
      flags: ['--copilot-concurrency', '2', '--container-concurrency', '7'],
      copilotConcurrency: 2,
      containerConcurrency: 7,
    },
    {flags: ['-c', '3'], copilotConcurrency: 3, containerConcurrency: 5},
  ])('forwards independently parsed limits: $flags', async ({flags, copilotConcurrency, containerConcurrency}) => {
    await expect(
      runCommand(command, {
        rawArgs: [...args, '--token', 'test-token', ...flags],
      }),
    ).rejects.toBe(stopBeforeRunning)
    expect(runPlan).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        copilotConcurrency,
        containerConcurrency,
      }),
    )
    expect(vi.mocked(runPlan).mock.calls[0][0]).not.toHaveProperty('concurrency')
  })

  test.each(['copilot-concurrency', 'container-concurrency'])(
    'rejects invalid --%s before starting work',
    async option => {
      await expect(
        runCommand(command, {
          rawArgs: [...args, '--token', 'test-token', `--${option}`, '1.5'],
        }),
      ).rejects.toThrow(`Expected --${option} to be a positive integer`)
      expect(runPlan).not.toHaveBeenCalled()
    },
  )
})

test.each([
  ['1', 1],
  ['05', 5],
  [' 3 ', 3],
  ['9007199254740991', Number.MAX_SAFE_INTEGER],
] as const)('parses positive integer concurrency %s', (input, expected) => {
  expect(getConcurrencyValue(input, 'copilot-concurrency')).toBe(expected)
})

test.each(['', '0', '-1', '1.5', '2trials', 'NaN', 'Infinity', '1e2', '0x10', '9007199254740992'])(
  'rejects invalid concurrency %j without silently choosing a default',
  input => {
    expect(() => {
      getConcurrencyValue(input, 'container-concurrency')
    }).toThrow('Expected --container-concurrency to be a positive integer')
  },
)
