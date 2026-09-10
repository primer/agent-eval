import path from 'node:path'
import {DEFAULT_DOCKER_IMAGE} from './sandbox'
import type {Shard} from './shard'
import {validateTrialExecutionOptions, type TrialExecutionOptions} from './trial'

type EnvironmentConfig = {
  artifactsDirectory: string
  benchmarksDirectory: string
  concurrency: number
  copilotToken: string
  dockerImage: string
  execution?: TrialExecutionOptions
  experimentsDirectory: string
  failFast?: boolean
  maxRetries?: number
  outputPath: string
  preparedImage?: string
  scenariosDirectory: string
}

type EnvironmentOptions = {
  benchmarksDirectory?: string
  captureWalkthrough?: boolean
  concurrency?: string
  copilotToken: string
  dockerImage?: string
  experimentsDirectory?: string
  failFast?: boolean
  installDependencies?: boolean
  maxAiCredits?: string
  maxRetries?: string
  outputDirectory?: string
  outputPath?: string
  preparedImage?: string
  scenariosDirectory?: string
  shard?: Shard
  timeoutMs?: string
}

function getEnvironmentConfig(options: EnvironmentOptions): EnvironmentConfig {
  if (options.outputDirectory && options.outputPath) {
    throw new Error('--output-dir cannot be combined with --output')
  }

  const dockerImage = options.dockerImage?.trim()
  const preparedImage = options.preparedImage?.trim()
  if (options.preparedImage !== undefined && !preparedImage) {
    throw new Error('--prepared-image must not be empty')
  }
  if (dockerImage && preparedImage) {
    throw new Error('--prepared-image cannot be combined with --docker-image')
  }

  const outputDirectory = options.outputDirectory ? path.resolve(options.outputDirectory) : undefined
  const benchmarksDirectory = path.resolve(options.benchmarksDirectory ?? 'benchmarks')
  const parsedConcurrency = options.concurrency ? parseInt(options.concurrency, 10) : 1
  const concurrency =
    Number.isFinite(parsedConcurrency) && Number.isInteger(parsedConcurrency) && parsedConcurrency >= 1
      ? parsedConcurrency
      : 1
  const experimentsDirectory = path.resolve(options.experimentsDirectory ?? 'experiments')
  const outputPath = outputDirectory
    ? path.join(outputDirectory, options.shard ? `output-${options.shard.order}.json` : 'output.json')
    : path.resolve(options.outputPath ?? 'output.json')
  const artifactsDirectory = path.join(path.dirname(outputPath), 'artifacts')
  const scenariosDirectory = path.resolve(options.scenariosDirectory ?? 'scenarios')
  const execution = validateTrialExecutionOptions({
    captureWalkthrough: options.captureWalkthrough,
    installDependencies: options.installDependencies,
    maxAiCredits: parseOptionalInteger(options.maxAiCredits, '--max-ai-credits'),
    timeoutMs: parseOptionalInteger(options.timeoutMs, '--timeout-ms'),
  })
  const maxRetries = parseOptionalInteger(options.maxRetries, '--max-retries') ?? 3
  if (maxRetries < 0) {
    throw new Error('--max-retries must be a non-negative integer')
  }

  return {
    artifactsDirectory,
    benchmarksDirectory,
    concurrency,
    copilotToken: options.copilotToken,
    dockerImage: dockerImage ?? DEFAULT_DOCKER_IMAGE,
    execution,
    experimentsDirectory,
    failFast: options.failFast ?? false,
    maxRetries,
    outputPath,
    ...(preparedImage ? {preparedImage} : {}),
    scenariosDirectory,
  }
}

function parseOptionalInteger(value: string | undefined, option: string): number | undefined {
  if (value === undefined) {
    return undefined
  }

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${option} must be an integer`)
  }
  return parsed
}

export {getEnvironmentConfig}
export type {EnvironmentConfig}
