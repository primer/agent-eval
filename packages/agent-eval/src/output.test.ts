import {expect, test} from 'vitest'
import {output as getBenchmarkOutput, write as writeBenchmarkOutput, type BenchmarkOutput} from './benchmark'
import {output as getExperimentOutput, write as writeExperimentOutput, type ExperimentOutput} from './experiment'
import {VirtualHost} from './host'
import {mergeShardOutputs} from './output'

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
  const merged = await mergeShardOutputs(filepaths, {host})

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

  const merged = await mergeShardOutputs(['/bundle/output-1.json', '/bundle/output-2.json'], {
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
    mergeShardOutputs(filepaths, {
      host,
      targetDirectory: '/merged',
    }),
  ).rejects.toThrow('Shard outputs and the merged output must use the same directory')
})
