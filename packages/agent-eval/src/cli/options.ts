import path from 'node:path'
import {CopilotRunnerSchema} from '../copilot-runner'
import {DEFAULT_DOCKER_IMAGE} from '../sandbox'
import type {Shard} from '../shard'

const benchmarksOption = {
  type: 'string',
  description: 'The directory containing local benchmark files',
  default: './benchmarks',
} as const

const copilotConcurrencyOption = {
  type: 'string',
  alias: 'c',
  description: 'The maximum number of Copilot sessions to run in parallel',
  default: '1',
} as const

const containerConcurrencyOption = {
  type: 'string',
  description: 'The maximum number of trial containers to run in parallel',
  default: '5',
} as const

function getConcurrencyValue(input: string, option: string): number {
  const value = Number(input)
  if (!/^\d+$/.test(input.trim()) || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Expected --${option} to be a positive integer, received: ${JSON.stringify(input)}`)
  }

  return value
}

const dockerImageOption = {
  type: 'string',
  description:
    'The fallback Docker base image (Debian-based Node with npm, apt-get, and a node user); scenario images take precedence',
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

const runnerOption = {
  type: 'enum',
  options: CopilotRunnerSchema.options,
  description: 'The implementation runner to use (for saved plans, select trials with this runner)',
} as const

const shardOption = {
  type: 'string',
  description: 'The durable plan shard to run, formatted as order/total',
} as const

export {
  benchmarksOption,
  copilotConcurrencyOption,
  containerConcurrencyOption,
  getConcurrencyValue,
  dockerImageOption,
  githubCopilotTokenOption,
  getCopilotToken,
  experimentsOption,
  outputDirectoryOption,
  getOutputPath,
  planOption,
  scenariosOption,
  runnerOption,
  shardOption,
}
