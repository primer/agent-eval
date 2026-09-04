import {afterEach, describe, expect, test, vi} from 'vitest'
import {output as getBenchmarkOutput, write as writeBenchmarkOutput, type BenchmarkOutput} from './benchmark'
import {output as getExperimentOutput, write as writeExperimentOutput, type ExperimentOutput} from './experiment'
import {VirtualHost} from './host'
import {create, deserialize, isBenchmarkPlan, mergeResults, run, select, serialize} from './plan'
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

function createReference(id: string) {
  return {
    id,
    scenarioId: 'scenario',
    treatmentId: 'Control',
    model: {
      name: 'gpt-5.6-sol' as const,
      reasoningEffort: 'medium' as const,
    },
  }
}

async function writeBenchmarkShards(host: VirtualHost, outputs: Array<BenchmarkOutput>): Promise<Array<string>> {
  return Promise.all(
    outputs.map(async (output, index) => {
      const filepath = `/bundle/output-${index + 1}.json`
      await writeBenchmarkOutput(filepath, output, {host})
      return filepath
    }),
  )
}

async function writeExperimentShards(host: VirtualHost, outputs: Array<ExperimentOutput>): Promise<Array<string>> {
  return Promise.all(
    outputs.map(async (output, index) => {
      const filepath = `/bundle/output-${index + 1}.json`
      await writeExperimentOutput(filepath, output, {host})
      return filepath
    }),
  )
}

describe('create', () => {
  test('randomizes trials without mutating the input', async () => {
    const trials = [createReference('one'), createReference('two'), createReference('three')]
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0)

    const plan = create({
      source: {
        kind: 'experiment',
        id: 'test',
      },
      trials,
    })

    expect(plan.trials.map(trial => trial.id)).toEqual(['two', 'three', 'one'])
    expect(trials.map(trial => trial.id)).toEqual(['one', 'two', 'three'])
  })

  test('serializes and deserializes the durable plan without changing order or ids', () => {
    const plan = create({
      source: {
        kind: 'experiment',
        id: 'test',
      },
      trials: [createReference('one'), createReference('two')],
    })

    const restored = deserialize(serialize(plan))

    expect(restored).toEqual(plan)
    expect(restored.trials.map(trial => trial.id)).toEqual(plan.trials.map(trial => trial.id))
    expect(JSON.parse(serialize(plan))).toEqual(plan)
    expect(serialize(plan)).not.toContain('setup')
  })

  test('rejects invalid durable plans', () => {
    expect(() => {
      deserialize({
        version: 1,
        source: {
          kind: 'benchmark',
          id: 'test',
        },
        trials: [createReference('trial')],
      })
    }).toThrow()
  })

  test('selects deterministic shards from durable plan order', () => {
    const plan = deserialize({
      version: 1,
      source: {
        kind: 'experiment',
        id: 'test',
      },
      trials: ['one', 'two', 'three', 'four', 'five'].map(createReference),
    })

    if (isBenchmarkPlan(plan)) {
      throw new Error('Expected experiment plan')
    }

    expect(select(plan, {order: 2, total: 3}).trials.map(trial => trial.id)).toEqual(['two', 'five'])
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

describe('mergeResults', () => {
  test('detects and merges benchmark shard outputs', async () => {
    const host = VirtualHost.create()
    const filepaths = await writeBenchmarkShards(host, [
      getBenchmarkOutput('benchmark', []),
      getBenchmarkOutput('benchmark', []),
    ])
    const merged = await mergeResults(filepaths, {host})

    expect(merged.kind).toBe('benchmark')
    expect(merged.output).toEqual({
      benchmarkId: 'benchmark',
      capabilities: {},
      scenarios: {},
      treatments: {},
      trials: {},
    })
  })

  test('detects and merges experiment shard outputs', async () => {
    const host = VirtualHost.create()
    const filepaths = await writeExperimentShards(host, [
      getExperimentOutput('experiment', []),
      getExperimentOutput('experiment', []),
    ])
    const merged = await mergeResults(filepaths, {host})

    expect(merged.kind).toBe('experiment')
    expect(merged.output).toEqual({
      experimentId: 'experiment',
      scenarios: {},
      treatments: {},
      trials: {},
    })
  })

  test('rejects mixed output types', async () => {
    const host = VirtualHost.create()
    await writeBenchmarkOutput('/bundle/output-1.json', getBenchmarkOutput('benchmark', []), {host})
    await writeExperimentOutput('/bundle/output-2.json', getExperimentOutput('experiment', []), {host})

    await expect(
      mergeResults(['/bundle/output-1.json', '/bundle/output-2.json'], {
        host,
      }),
    ).rejects.toThrow('Cannot merge benchmark and experiment shard outputs together')
  })

  test('requires shard outputs from one source id', async () => {
    const host = VirtualHost.create()
    const filepaths = await writeBenchmarkShards(host, [
      getBenchmarkOutput('first', []),
      getBenchmarkOutput('second', []),
    ])

    await expect(mergeResults(filepaths, {host})).rejects.toThrow(
      'Cannot merge benchmark outputs for different sources',
    )
  })

  test('combines trial file references without reading the trial files', async () => {
    const host = VirtualHost.create()
    await host.fs.mkdir('/bundle', {recursive: true})
    await host.fs.writeFile(
      '/bundle/output-1.json',
      JSON.stringify({
        experimentId: 'experiment',
        scenarios: {},
        treatments: {},
        trials: {
          first: 'artifacts/first/first.json',
        },
      }),
      'utf-8',
    )
    await host.fs.writeFile(
      '/bundle/output-2.json',
      JSON.stringify({
        experimentId: 'experiment',
        scenarios: {},
        treatments: {},
        trials: {
          second: 'artifacts/second/second.json',
        },
      }),
      'utf-8',
    )

    const merged = await mergeResults(['/bundle/output-1.json', '/bundle/output-2.json'], {
      host,
    })

    if (merged.kind !== 'experiment') {
      throw new Error('Expected experiment output')
    }

    expect(merged.output.trials).toEqual({
      first: 'artifacts/first/first.json',
      second: 'artifacts/second/second.json',
    })
  })

  test('requires the merged output to stay beside the shard outputs', async () => {
    const host = VirtualHost.create()
    const filepaths = await writeExperimentShards(host, [getExperimentOutput('experiment', [])])

    await expect(
      mergeResults(filepaths, {
        host,
        targetDirectory: '/merged',
      }),
    ).rejects.toThrow('Shard outputs and the merged output must use the same directory')
  })
})
