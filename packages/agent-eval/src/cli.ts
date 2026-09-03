#!/usr/bin/env node

import {existsSync} from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import {parseArgs} from 'node:util'
import {getEnvironmentConfig} from './environment'
import {
  getBenchmark,
  run as runBenchmark,
  output as getBenchmarkOutput,
  serialize as serializeBenchmarkOutput,
} from './benchmark'
import {
  getExperiment,
  run as runExperiment,
  output as getExperimentOutput,
  serialize as serializeExperimentOutput,
} from './experiment'
import {logger} from './logger'
import {formatExperimentResults} from './report'
import {compare as compareTrial} from './trial'

const {values} = parseArgs({
  options: {
    artifacts: {
      type: 'string',
      short: 'a',
      description: 'The directory to save artifacts to',
    },
    benchmark: {
      type: 'string',
      short: 'b',
      description: 'The file name of the benchmark to run',
    },
    benchmarks: {
      type: 'string',
      description: 'The directory containing local benchmark files',
    },
    concurrency: {
      type: 'string',
      short: 'c',
      description: 'The number of treatments to run in parallel',
    },
    'docker-image': {
      type: 'string',
      description:
        'The Docker container image to use for running treatments (must be a Debian-based Node image with apt-get and a node user, e.g. node:26.5.0-slim)',
    },
    experiment: {
      type: 'string',
      short: 'e',
      description: 'The file name of the experiment to run',
    },
    experiments: {
      type: 'string',
      description: 'The directory containing local experiment files',
    },
    help: {
      type: 'boolean',
      short: 'h',
      description: 'Learn more about the command and its options',
    },
    'log-level': {
      type: 'string',
      description: 'The log level to use',
    },
    output: {
      type: 'string',
      description: 'The target file in which results are written',
      default: 'output.json',
    },
    scenarios: {
      type: 'string',
      description: 'The directory containing scenario directories',
    },
  },
})

function displayHelp() {
  console.log(`
Usage: agent-eval [options]

Options:
  -a, --artifacts <dir>      The directory to save artifacts to (default: ./artifacts)
  -b, --benchmark <file>     The file name of the benchmark to run
      --benchmarks <dir>     The directory containing local benchmark files (default: ./benchmarks)
  -c, --concurrency <num>    The number of treatments to run in parallel
      --docker-image <image> The Docker container image to use for running treatments (must be a Debian-based Node image with apt-get and a node user, e.g. node:26.5.0-slim)
  -e, --experiment <file>    The file name of the experiment to run
      --experiments <dir>    The directory containing local experiment files (default: ./experiments)
  -h, --help                 Learn more about the command and its options
      --log-level <level>    The log level to use (default: info)
      --output <file>        The target file in which results are written (default: output.json)
      --scenarios <dir>      The directory containing scenario directories (default: ./scenarios)
`)
}

if (values.help) {
  displayHelp()
  process.exit(0)
}

if (values['log-level']) {
  logger.level = values['log-level']
}

const COPILOT_GITHUB_TOKEN = process.env.COPILOT_GITHUB_TOKEN
const GITHUB_STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY

if (!COPILOT_GITHUB_TOKEN) {
  throw new Error('COPILOT_GITHUB_TOKEN environment variable is required to run agent-eval')
}

const env = getEnvironmentConfig({
  artifactsDirectory: values.artifacts,
  benchmarksDirectory: values.benchmarks,
  concurrency: values.concurrency,
  copilotToken: COPILOT_GITHUB_TOKEN,
  dockerImage: values['docker-image']?.trim(),
  experimentsDirectory: values.experiments,
  outputPath: values.output,
  scenariosDirectory: values.scenarios,
})

logger.debug('Environment configuration: %o', env)

if (values.benchmark) {
  logger.info('Running benchmark: %s', values.benchmark)

  const benchmark = await getBenchmark({
    benchmarksDirectory: env.benchmarksDirectory,
    scenariosDirectory: env.scenariosDirectory,
    id: values.benchmark,
  })
  const result = await runBenchmark({
    env,
    id: values.benchmark,
  })
  const sorted = result.toSorted(compareTrial)

  if (!existsSync(path.dirname(env.outputPath))) {
    await fs.mkdir(path.dirname(env.outputPath), {recursive: true})
  }

  logger.info('Writing benchmark output to: %s', env.outputPath)
  await fs.writeFile(env.outputPath, serializeBenchmarkOutput(getBenchmarkOutput(benchmark.id, sorted)), 'utf-8')

  const resultSummaries = formatExperimentResults(benchmark.name, sorted)
  console.log(resultSummaries)

  if (GITHUB_STEP_SUMMARY) {
    await fs.appendFile(GITHUB_STEP_SUMMARY, `## Benchmark results\n\n\`\`\`\n${resultSummaries}\n\`\`\`\n`)
  }
} else if (values.experiment) {
  logger.info('Running experiment: %s', values.experiment)

  const experiment = await getExperiment({
    experimentsDirectory: env.experimentsDirectory,
    scenariosDirectory: env.scenariosDirectory,
    id: values.experiment,
  })
  const result = await runExperiment({
    env,
    id: values.experiment,
  })
  const sorted = result.toSorted(compareTrial)

  logger.info('Writing experiment output to: %s', env.outputPath)

  const output = getExperimentOutput(experiment.id, sorted)

  if (!existsSync(path.dirname(env.outputPath))) {
    await fs.mkdir(path.dirname(env.outputPath), {recursive: true})
  }

  await fs.writeFile(env.outputPath, serializeExperimentOutput(output), 'utf-8')

  const resultSummaries = formatExperimentResults(experiment.name, sorted)
  console.log(resultSummaries)

  if (GITHUB_STEP_SUMMARY) {
    await fs.appendFile(GITHUB_STEP_SUMMARY, `## Experiment results\n\n\`\`\`\n${resultSummaries}\n\`\`\`\n`)
  }
} else {
  displayHelp()
}
