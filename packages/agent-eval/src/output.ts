import path from 'node:path'
import {merge as mergeBenchmarkOutputs, read as readBenchmarkOutput, type BenchmarkOutput} from './benchmark'
import {merge as mergeExperimentOutputs, read as readExperimentOutput, type ExperimentOutput} from './experiment'
import {DefaultHost, type Host} from './host'
import type {TrialResult} from './trial'

type MergedOutput =
  | {
      kind: 'benchmark'
      output: BenchmarkOutput
    }
  | {
      kind: 'experiment'
      output: ExperimentOutput
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
    const outputs = await Promise.all(
      filepaths.map(async filepath => {
        const output = await readBenchmarkOutput(filepath, {host})
        return rebaseBenchmarkOutput(output, path.dirname(filepath), options.targetDirectory)
      }),
    )
    const output = mergeBenchmarkOutputs(outputs)
    return {
      kind: 'benchmark',
      output,
    }
  }

  const outputs = await Promise.all(
    filepaths.map(async filepath => {
      const output = await readExperimentOutput(filepath, {host})
      return rebaseExperimentOutput(output, path.dirname(filepath), options.targetDirectory)
    }),
  )
  const output = mergeExperimentOutputs(outputs)
  return {
    kind: 'experiment',
    output,
  }
}

function getOutputKind(input: unknown): 'benchmark' | 'experiment' {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Shard output must be a JSON object')
  }

  const hasBenchmarkId = 'benchmarkId' in parsed
  const hasExperimentId = 'experimentId' in parsed
  if (hasBenchmarkId === hasExperimentId) {
    throw new Error('Shard output must contain exactly one of benchmarkId or experimentId')
  }

  return hasBenchmarkId ? 'benchmark' : 'experiment'
}

function rebaseBenchmarkOutput(
  output: BenchmarkOutput,
  sourceDirectory: string,
  targetDirectory?: string,
): BenchmarkOutput {
  if (!sourceDirectory || !targetDirectory) {
    return output
  }

  for (const [id, trial] of output.trials) {
    output.trials.set(id, {
      ...trial,
      artifacts: rebaseArtifacts(trial.artifacts, sourceDirectory, targetDirectory),
      walkthrough: rebaseWalkthrough(trial.walkthrough, sourceDirectory, targetDirectory),
    })
  }

  return output
}

function rebaseExperimentOutput(
  output: ExperimentOutput,
  sourceDirectory: string,
  targetDirectory?: string,
): ExperimentOutput {
  if (!sourceDirectory || !targetDirectory) {
    return output
  }

  for (const [id, trial] of output.trials) {
    output.trials.set(id, {
      ...trial,
      artifacts: rebaseArtifacts(trial.artifacts, sourceDirectory, targetDirectory),
      walkthrough: rebaseWalkthrough(trial.walkthrough, sourceDirectory, targetDirectory),
    })
  }

  return output
}

function rebaseArtifacts(
  artifacts: TrialResult['artifacts'],
  sourceDirectory: string,
  targetDirectory: string,
): TrialResult['artifacts'] {
  return {
    directory: rebasePath(artifacts.directory, sourceDirectory, targetDirectory),
    copilotConfigDirectory: rebasePath(artifacts.copilotConfigDirectory, sourceDirectory, targetDirectory),
    skillsConfigDirectory: rebasePath(artifacts.skillsConfigDirectory, sourceDirectory, targetDirectory),
    testResultsPath: rebasePath(artifacts.testResultsPath, sourceDirectory, targetDirectory),
    workspaceDirectory: rebasePath(artifacts.workspaceDirectory, sourceDirectory, targetDirectory),
  }
}

function rebaseWalkthrough(
  walkthrough: TrialResult['walkthrough'],
  sourceDirectory: string,
  targetDirectory: string,
): TrialResult['walkthrough'] {
  if (walkthrough.type === 'Screenshots') {
    return {
      ...walkthrough,
      screenshots: walkthrough.screenshots.map(filepath => {
        return rebasePath(filepath, sourceDirectory, targetDirectory)
      }),
    }
  }

  if (walkthrough.type === 'Screenshot' || walkthrough.type === 'Video') {
    return {
      ...walkthrough,
      filepath: rebasePath(walkthrough.filepath, sourceDirectory, targetDirectory),
    }
  }

  return walkthrough
}

function rebasePath(filepath: string, sourceDirectory: string, targetDirectory: string): string {
  if (path.isAbsolute(filepath)) {
    return filepath
  }

  return path.relative(targetDirectory, path.resolve(sourceDirectory, filepath)).split(path.sep).join(path.posix.sep)
}

export {mergeShardOutputs}
export type {MergedOutput, MergeShardOutputOptions}
