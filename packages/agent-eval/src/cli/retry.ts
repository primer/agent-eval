import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {DefaultHost, type Host} from '../host'
import {logger} from '../logger'
import {BenchmarkOutputFileSchema, createBenchmarkOutput, mergeBenchmarkOutputFiles} from '../benchmark/output'
import {parseBenchmarkPlanManifest} from '../benchmark/plan'
import {createBenchmarkReport} from '../benchmark/report'
import {
  ExperimentOutputFileSchema,
  createExperimentOutput,
  mergeExperimentOutputFiles,
  type ExperimentTrialOutput,
} from '../experiment/output'
import {parseExperimentPlanManifest} from '../experiment/plan'
import {createExperimentReport} from '../experiment/report'
import {createPlanFromManifest, runPlan, type RunPlanResult} from '../plan'
import {resolveTrialArtifactsPath, serializeTrialPaths} from '../result-path'
import type {Trial} from '../trial/trial'
import type {RunTrialResult} from '../trial/run'
import {getCopilotToken, getOutputPath} from './options'

type RetryEvaluationOptions = {
  type: 'benchmark' | 'experiment'
  benchmarksDirectory: string
  experimentsDirectory: string
  scenariosDirectory: string
  outputDirectory: string
  copilotConcurrency: number
  containerConcurrency: number
  token?: string
  host?: Host
}

async function retryEvaluation({host = DefaultHost, ...options}: RetryEvaluationOptions): Promise<string> {
  const outputPath = getOutputPath(options.outputDirectory)
  const contents = await host.fs.promises.readFile(outputPath, 'utf-8')

  if (options.type === 'benchmark') {
    const file = BenchmarkOutputFileSchema.parse(JSON.parse(contents))
    const output = await mergeBenchmarkOutputFiles({
      host,
      outputs: [file],
      outputDirectory: options.outputDirectory,
    })
    if (![...output.trials.values()].some(isFailed)) {
      return 'No failed trials to retry.'
    }
    const {benchmark, trials} = await parseBenchmarkPlanManifest({
      ...options,
      host,
      contents: JSON.stringify({
        id: file.id,
        name: file.id,
        trials: [...output.trials.values()],
      }),
    })
    const result = await retryTrials({
      ...options,
      host,
      trials,
      outputs: output.trials,
      paths: file.trials,
      createOutputs(runPlanResult) {
        return createBenchmarkOutput({benchmark, runPlanResult}).trials
      },
    })
    return createBenchmarkReport({benchmark, runPlanResult: result})
  }

  const file = ExperimentOutputFileSchema.parse(JSON.parse(contents))
  const output = await mergeExperimentOutputFiles({
    host,
    outputs: [file],
    outputDirectory: options.outputDirectory,
  })
  if (![...output.trials.values()].some(isFailed)) {
    return 'No failed trials to retry.'
  }
  const {experiment, trials} = await parseExperimentPlanManifest({
    ...options,
    host,
    contents: JSON.stringify({
      id: file.id,
      name: file.id,
      trials: [...output.trials.values()],
    }),
  })
  const result = await retryTrials({
    ...options,
    host,
    trials,
    outputs: output.trials,
    paths: file.trials,
    createOutputs(runPlanResult) {
      return createExperimentOutput({experiment, runPlanResult}).trials
    },
  })
  return createExperimentReport({experiment, runPlanResult: result})
}

function isFailed(trial: ExperimentTrialOutput): boolean {
  return trial.type === 'error'
}

type RetryTrialsOptions<T extends Trial, O extends ExperimentTrialOutput> = Omit<
  RetryEvaluationOptions,
  'type' | 'host'
> & {
  host: Host
  trials: Array<T>
  outputs: Map<string, O>
  paths: Record<string, string>
  createOutputs: (result: RunPlanResult<T>) => Map<string, O>
}

async function retryTrials<T extends Trial, O extends ExperimentTrialOutput>({
  host,
  trials,
  outputs,
  paths,
  outputDirectory,
  copilotConcurrency,
  containerConcurrency,
  token,
  createOutputs,
}: RetryTrialsOptions<T, O>): Promise<RunPlanResult<T>> {
  const selected = trials.filter(trial => {
    return outputs.get(trial.id)?.type === 'error'
  })
  logger.info(
    'Retrying %s failed trials; preserving %s completed trials',
    selected.length,
    trials.length - selected.length,
  )
  const result = await runPlan({
    host,
    artifactsDirectory: path.join(outputDirectory, 'artifacts'),
    copilotConcurrency,
    containerConcurrency,
    copilotToken: getCopilotToken(token),
    plan: createPlanFromManifest({trials: selected}),
  })

  for (const [id, trialOutput] of createOutputs(result)) {
    const filepath = await resolveTrialArtifactsPath(host, outputDirectory, paths[id])
    const temporaryPath = `${filepath}.${randomUUID()}.tmp`
    const persisted =
      trialOutput.type === 'success'
        ? {
            ...trialOutput,
            ...serializeTrialPaths(trialOutput, outputDirectory),
          }
        : trialOutput
    try {
      await host.fs.promises.writeFile(temporaryPath, JSON.stringify(persisted, null, 2), 'utf-8')
      await host.fs.promises.rename(temporaryPath, filepath)
    } finally {
      await host.fs.promises.rm(temporaryPath, {force: true})
    }
    outputs.set(id, trialOutput)
  }

  return {
    results: trials.map(trial => {
      const output = outputs.get(trial.id)
      if (!output) {
        throw new Error(`Missing result for trial: ${trial.id}`)
      }
      const result: RunTrialResult =
        output.type === 'error'
          ? {
              type: 'error',
              error: output.error,
            }
          : {
              type: 'success',
              trial,
              agent: output.agent,
              artifacts: output.artifacts,
              checks: output.checks,
              judges: output.judges,
              walkthrough: output.walkthrough,
            }
      return {trial, result}
    }),
  }
}

export {retryEvaluation}
