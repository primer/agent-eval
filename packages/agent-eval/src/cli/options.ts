import path from 'node:path'
import {DEFAULT_DOCKER_IMAGE} from '../sandbox'
import type {Shard} from '../shard'

const benchmarksOption = {
  type: 'string',
  description: 'The directory containing local benchmark files',
  default: './benchmarks',
} as const

const DEFAULT_CONCURRENCY = 1

const concurrencyOption = {
  type: 'string',
  alias: 'c',
  description: 'The number of treatments to run in parallel',
  default: '1',
} as const

function getConcurrencyValue(input: string): number {
  const value = parseInt(input, 10)

  if (!Number.isFinite(value)) {
    return DEFAULT_CONCURRENCY
  }

  if (!Number.isInteger(value)) {
    return DEFAULT_CONCURRENCY
  }

  if (value < 1) {
    return DEFAULT_CONCURRENCY
  }

  return value
}

const dockerImageOption = {
  type: 'string',
  description:
    'The Docker base image to layer the treatment environment on (must be a Debian-based Node image with npm, apt-get, and a node user',
  default: DEFAULT_DOCKER_IMAGE,
} as const

const experimentsOption = {
  type: 'string',
  description: 'The directory containing local experiment files',
  default: './experiments',
} as const

const githubCopilotTokenOption = {
  type: 'string',
  description: 'The GitHub Copilot token to use for authentication',
} as const

const COPILOT_GITHUB_TOKEN = process.env.COPILOT_GITHUB_TOKEN

function getCopilotToken(value?: string): string {
  if (value) {
    return value
  }

  if (COPILOT_GITHUB_TOKEN) {
    return COPILOT_GITHUB_TOKEN
  }

  throw new Error(
    'Expected a GitHub Copilot token to be provided via the --token option or the COPILOT_GITHUB_TOKEN environment variable',
  )
}

const outputDirectoryOption = {
  type: 'string',
  description: 'The directory containing output.json and its artifacts',
  default: './results',
} as const

const DEFAULT_OUTPUT_FILE = 'output.json'

function getOutputPath(outputDirectory: string, shard?: Shard): string {
  if (shard) {
    return path.join(outputDirectory, `output-${shard.order}.json`)
  }
  return path.join(outputDirectory, DEFAULT_OUTPUT_FILE)
}

const planOption = {
  type: 'string',
  description: 'The path to a plan for a benchmark or experiment run',
} as const

const scenariosOption = {
  type: 'string',
  description: 'The directory containing scenario directories',
  default: './scenarios',
} as const

const shardOption = {
  type: 'string',
  description: 'The durable plan shard to run, formatted as order/total',
} as const

export {
  benchmarksOption,
  concurrencyOption,
  getConcurrencyValue,
  dockerImageOption,
  githubCopilotTokenOption,
  getCopilotToken,
  experimentsOption,
  outputDirectoryOption,
  getOutputPath,
  planOption,
  scenariosOption,
  shardOption,
}
