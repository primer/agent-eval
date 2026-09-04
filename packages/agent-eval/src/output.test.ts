import {expect, test} from 'vitest'
import {output as getBenchmarkOutput, write as writeBenchmarkOutput, type BenchmarkOutput} from './benchmark'
import {output as getExperimentOutput, write as writeExperimentOutput, type ExperimentOutput} from './experiment'
import {VirtualHost} from './host'
import {mergeShardOutputs} from './output'
import type {TrialResult} from './trial'

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

test('detects and merges benchmark shard outputs', async () => {
  const host = VirtualHost.create()
  const filepaths = await writeBenchmarkShards(host, [
    getBenchmarkOutput('benchmark', []),
    getBenchmarkOutput('benchmark', []),
  ])
  const merged = await mergeShardOutputs(filepaths, {host})

  expect(merged.kind).toBe('benchmark')
  expect(merged.output).toEqual({
    benchmarkId: 'benchmark',
    capabilities: new Map(),
    scenarios: new Map(),
    treatments: new Map(),
    trials: new Map(),
  })
})

test('detects and merges experiment shard outputs', async () => {
  const host = VirtualHost.create()
  const filepaths = await writeExperimentShards(host, [
    getExperimentOutput('experiment', []),
    getExperimentOutput('experiment', []),
  ])
  const merged = await mergeShardOutputs(filepaths, {host})

  expect(merged.kind).toBe('experiment')
  expect(merged.output).toEqual({
    experimentId: 'experiment',
    scenarios: new Map(),
    treatments: new Map(),
    trials: new Map(),
  })
})

test('rejects mixed output types', async () => {
  const host = VirtualHost.create()
  await writeBenchmarkOutput('/bundle/output-1.json', getBenchmarkOutput('benchmark', []), {host})
  await writeExperimentOutput('/bundle/output-2.json', getExperimentOutput('experiment', []), {host})

  await expect(
    mergeShardOutputs(['/bundle/output-1.json', '/bundle/output-2.json'], {
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

  await expect(mergeShardOutputs(filepaths, {host})).rejects.toThrow(
    'Cannot merge benchmark outputs for different sources',
  )
})

test('rebases portable artifact paths when the merged output uses a different directory', async () => {
  const trialResult: TrialResult = {
    artifacts: {
      directory: '/bundle/shards/artifacts/trial',
      copilotConfigDirectory: '/bundle/shards/artifacts/trial/.copilot',
      skillsConfigDirectory: '/bundle/shards/artifacts/trial/.agents',
      testResultsPath: '/bundle/shards/artifacts/trial/workspace/test-results.json',
      workspaceDirectory: '/bundle/shards/artifacts/trial/workspace',
    },
    trial: {
      id: 'trial',
      scenario: {
        id: 'scenario',
        directory: '/scenarios/scenario',
        prompt: 'Complete the task',
        tags: [],
        testPath: '/scenarios/scenario/scenario.test.ts',
      },
      treatment: {
        name: 'Control',
      },
      model: {
        name: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
      },
    },
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
      type: 'Screenshot',
      filepath: '/bundle/shards/artifacts/trial/walkthrough/screenshot.png',
    },
  }
  const host = VirtualHost.create()
  const filepath = '/bundle/shards/output-1.json'
  await writeExperimentOutput(
    filepath,
    getExperimentOutput('experiment', [trialResult], {
      baseDirectory: '/bundle/shards',
    }),
    {host},
  )

  const merged = await mergeShardOutputs([filepath], {
    host,
    targetDirectory: '/bundle',
  })

  if (merged.kind !== 'experiment') {
    throw new Error('Expected experiment output')
  }

  expect(merged.output.trials.get('trial')).toEqual(
    expect.objectContaining({
      artifacts: expect.objectContaining({
        directory: 'shards/artifacts/trial',
      }),
      walkthrough: {
        type: 'Screenshot',
        filepath: 'shards/artifacts/trial/walkthrough/screenshot.png',
      },
    }),
  )
})
