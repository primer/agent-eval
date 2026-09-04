import path from 'node:path'
import {parseOutputFile as parseBenchmarkOutputFile, type BenchmarkOutputFile} from './benchmark'
import {parseOutputFile as parseExperimentOutputFile, type ExperimentOutputFile} from './experiment'
import {DefaultHost, type Host} from './host'

type MergedOutput =
  | {
      kind: 'benchmark'
      output: BenchmarkOutputFile
    }
  | {
      kind: 'experiment'
      output: ExperimentOutputFile
    }

type MergeShardOutputOptions = {
  host?: Host
  targetDirectory?: string
}

async function mergeShardOutputs(
  filepaths: Array<string>,
  options: MergeShardOutputOptions = {},
): Promise<MergedOutput> {
  if (filepaths.length === 0) {
    throw new Error('No shard outputs were found to merge')
  }

  const targetDirectory = path.resolve(options.targetDirectory ?? path.dirname(filepaths[0]))
  for (const filepath of filepaths) {
    if (path.resolve(path.dirname(filepath)) !== targetDirectory) {
      throw new Error('Shard outputs and the merged output must use the same directory')
    }
  }

  const host = options.host ?? DefaultHost
  const manifests = await Promise.all(
    filepaths.map(async filepath => {
      return JSON.parse(await host.fs.readFile(filepath, 'utf-8')) as unknown
    }),
  )
  const kinds = manifests.map(getOutputKind)
  const firstKind = kinds[0]
  if (
    kinds.some(kind => {
      return kind !== firstKind
    })
  ) {
    throw new Error('Cannot merge benchmark and experiment shard outputs together')
  }

  if (firstKind === 'benchmark') {
    return {
      kind: 'benchmark',
      output: mergeBenchmarkOutputFiles(manifests.map(parseBenchmarkOutputFile)),
    }
  }

  return {
    kind: 'experiment',
    output: mergeExperimentOutputFiles(manifests.map(parseExperimentOutputFile)),
  }
}

function getOutputKind(input: unknown): 'benchmark' | 'experiment' {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Shard output must be a JSON object')
  }

  const hasBenchmarkId = 'benchmarkId' in input
  const hasExperimentId = 'experimentId' in input
  if (hasBenchmarkId === hasExperimentId) {
    throw new Error('Shard output must contain exactly one of benchmarkId or experimentId')
  }

  return hasBenchmarkId ? 'benchmark' : 'experiment'
}

function mergeBenchmarkOutputFiles(outputs: Array<BenchmarkOutputFile>): BenchmarkOutputFile {
  const [first, ...remaining] = outputs
  if (!first) {
    throw new Error('At least one benchmark output is required to merge shards')
  }

  const result = structuredClone(first)
  for (const output of remaining) {
    if (output.benchmarkId !== result.benchmarkId) {
      throw new Error(
        `Cannot merge benchmark outputs for different sources: "${result.benchmarkId}" and "${output.benchmarkId}"`,
      )
    }

    mergeMetadataRecord(result.capabilities, output.capabilities, 'capability')
    mergeMetadataRecord(result.scenarios, output.scenarios, 'scenario')
    mergeMetadataRecord(result.treatments, output.treatments, 'treatment')
    mergeTrialReferences(result.trials, output.trials)
  }

  return result
}

function mergeExperimentOutputFiles(outputs: Array<ExperimentOutputFile>): ExperimentOutputFile {
  const [first, ...remaining] = outputs
  if (!first) {
    throw new Error('At least one experiment output is required to merge shards')
  }

  const result = structuredClone(first)
  for (const output of remaining) {
    if (output.experimentId !== result.experimentId) {
      throw new Error(
        `Cannot merge experiment outputs for different sources: "${result.experimentId}" and "${output.experimentId}"`,
      )
    }

    mergeMetadataRecord(result.scenarios, output.scenarios, 'scenario')
    mergeMetadataRecord(result.treatments, output.treatments, 'treatment')
    mergeTrialReferences(result.trials, output.trials)
  }

  return result
}

function mergeMetadataRecord<T>(target: Record<string, T>, source: Record<string, T>, type: string): void {
  for (const [id, value] of Object.entries(source)) {
    if (id in target && JSON.stringify(target[id]) !== JSON.stringify(value)) {
      throw new Error(`Cannot merge conflicting ${type} metadata for id: ${id}`)
    }

    target[id] = value
  }
}

function mergeTrialReferences(target: Record<string, string>, source: Record<string, string>): void {
  for (const [trialId, reference] of Object.entries(source)) {
    if (trialId in target) {
      throw new Error(`Cannot merge duplicate trial id: ${trialId}`)
    }

    target[trialId] = reference
  }
}

export {mergeShardOutputs}
export type {MergedOutput, MergeShardOutputOptions}
