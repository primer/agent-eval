import path from 'node:path'
import {DEFAULT_DOCKER_IMAGE} from './sandbox'

type EnvironmentConfig = {
  artifactsDirectory: string
  benchmarksDirectory: string
  concurrency: number
  copilotToken: string
  dockerImage: string
  experimentsDirectory: string
  outputPath: string
  scenariosDirectory: string
}

type EnvironmentOptions = {
  artifactsDirectory?: string
  benchmarksDirectory?: string
  concurrency?: string
  copilotToken: string
  dockerImage?: string
  experimentsDirectory?: string
  outputPath?: string
  scenariosDirectory?: string
}

function getEnvironmentConfig(options: EnvironmentOptions): EnvironmentConfig {
  const artifactsDirectory = path.resolve(options.artifactsDirectory ?? 'artifacts')
  const benchmarksDirectory = path.resolve(options.benchmarksDirectory ?? 'benchmarks')
  const parsedConcurrency = options.concurrency ? parseInt(options.concurrency, 10) : 1
  const concurrency =
    Number.isFinite(parsedConcurrency) && Number.isInteger(parsedConcurrency) && parsedConcurrency >= 1
      ? parsedConcurrency
      : 1
  const experimentsDirectory = path.resolve(options.experimentsDirectory ?? 'experiments')
  const outputPath = path.resolve(options.outputPath ?? 'output.json')
  const scenariosDirectory = path.resolve(options.scenariosDirectory ?? 'scenarios')

  return {
    artifactsDirectory,
    benchmarksDirectory,
    concurrency,
    copilotToken: options.copilotToken,
    dockerImage: options.dockerImage ?? DEFAULT_DOCKER_IMAGE,
    experimentsDirectory,
    outputPath,
    scenariosDirectory,
  }
}

export {getEnvironmentConfig}
export type {EnvironmentConfig}
