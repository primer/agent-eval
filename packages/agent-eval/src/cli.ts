#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import {parseArgs} from 'node:util'
import {getCliMode, normalizeOptionalPathArguments} from './cli-options'
import {getEnvironmentConfig} from './environment'
import {
  createPlan as createBenchmarkPlan,
  getBenchmark,
  run as runBenchmark,
  output as getBenchmarkOutput,
  write as writeBenchmarkOutput,
} from './benchmark'
import {
  createPlan as createExperimentPlan,
  getExperiment,
  run as runExperiment,
  output as getExperimentOutput,
  write as writeExperimentOutput,
} from './experiment'
import {logger} from './logger'
import {
  deserialize as deserializePlan,
  isBenchmarkPlan,
  mergeResults,
  select as selectPlan,
  serialize as serializePlan,
  type BenchmarkPlan,
  type ExperimentPlan,
  type Plan,
} from './plan'
import {formatBenchmarkResults, formatExperimentResults} from './report'
import {parseShard} from './shard'
import {compare as compareTrial} from './trial'

const {values} = parseArgs({
  args: normalizeOptionalPathArguments(process.argv.slice(2)),
  options: {
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
        'The Docker base image to layer the treatment environment on (must be a Debian-based Node image with npm, apt-get, and a node user, default: node:26.5.0-slim)',
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
    },
    'output-dir': {
      type: 'string',
      description: 'The directory containing output.json and its artifacts',
    },
    scenarios: {
      type: 'string',
      description: 'The directory containing scenario directories',
    },
    plan: {
      type: 'string',
      description: 'Create a durable plan without running it',
    },
    'from-plan': {
      type: 'string',
      description: 'Run trials from a durable plan',
    },
    'merge-results': {
      type: 'boolean',
      description: 'Merge output-*.json shard outputs from a directory',
    },
    shard: {
      type: 'string',
      description: 'The durable plan shard to run, formatted as order/total',
    },
  },
})

function displayHelp() {
  console.log(`
Usage: agent-eval [options]

Options:
  -b, --benchmark <file>     The file name of the benchmark to run
      --benchmarks <dir>     The directory containing local benchmark files (default: ./benchmarks)
  -c, --concurrency <num>    The number of treatments to run in parallel
      --docker-image <image> The Docker base image to layer the treatment environment on (must be a Debian-based Node image with npm, apt-get, and a node user; default: node:26.5.0-slim)
  -e, --experiment <file>    The file name of the experiment to run
      --experiments <dir>    The directory containing local experiment files (default: ./experiments)
  -h, --help                 Learn more about the command and its options
      --log-level <level>    The log level to use (default: info)
      --output <file>        The target file in which results are written (default: output.json)
      --output-dir <dir>     The directory containing output.json and its artifacts
      --plan [path]          Create a durable plan without running it (default: plan.json)
      --from-plan [path]     Run trials from a durable plan (default: plan.json)
      --merge-results        Merge output-*.json files in --output-dir
      --scenarios <dir>      The directory containing scenario directories (default: ./scenarios)
      --shard <order/total>  Select a deterministic shard from --from-plan
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
const mode = getCliMode(values)
const shard = mode.kind === 'from-plan' && mode.shard ? parseShard(mode.shard) : undefined

const env = getEnvironmentConfig({
  benchmarksDirectory: values.benchmarks,
  concurrency: values.concurrency,
  copilotToken: COPILOT_GITHUB_TOKEN ?? '',
  dockerImage: values['docker-image']?.trim(),
  experimentsDirectory: values.experiments,
  outputDirectory: values['output-dir'],
  outputPath: values.output,
  scenariosDirectory: values.scenarios,
  shard,
})

logger.debug('Environment configuration: %o', env)

if (mode.kind === 'create-plan') {
  const planPath = path.resolve(mode.path)
  let plan: Plan

  if (mode.sourceKind === 'benchmark') {
    const benchmark = await getBenchmark({
      benchmarksDirectory: env.benchmarksDirectory,
      scenariosDirectory: env.scenariosDirectory,
      id: mode.sourceId,
    })
    plan = createBenchmarkPlan(benchmark)
  } else {
    const experiment = await getExperiment({
      experimentsDirectory: env.experimentsDirectory,
      scenariosDirectory: env.scenariosDirectory,
      id: mode.sourceId,
    })
    plan = createExperimentPlan(experiment)
  }

  await ensureParentDirectory(planPath)
  logger.info('Writing plan to: %s', planPath)
  await fs.writeFile(planPath, serializePlan(plan), 'utf-8')
} else if (mode.kind === 'merge-results') {
  const directory = path.dirname(env.outputPath)
  const entries = await fs.readdir(directory, {
    withFileTypes: true,
  })
  const filenames = entries
    .filter(entry => {
      return entry.isFile() && /^output-.*\.json$/.test(entry.name)
    })
    .map(entry => {
      return entry.name
    })
    .toSorted()
  const inputs = filenames.map(filename => {
    return path.join(directory, filename)
  })
  const merged = await mergeResults(inputs, {
    targetDirectory: path.dirname(env.outputPath),
  })

  await ensureParentDirectory(env.outputPath)
  logger.info('Writing merged %s output to: %s', merged.kind, env.outputPath)
  await fs.writeFile(env.outputPath, JSON.stringify(merged.output), 'utf-8')
} else if (mode.kind === 'benchmark') {
  requireCopilotToken(COPILOT_GITHUB_TOKEN)
  logger.info('Running benchmark: %s', mode.id)

  const benchmark = await getBenchmark({
    benchmarksDirectory: env.benchmarksDirectory,
    scenariosDirectory: env.scenariosDirectory,
    id: mode.id,
  })
  const result = await runBenchmark({
    env,
    id: mode.id,
  })
  const sorted = result.toSorted(compareTrial)

  logger.info('Writing benchmark output to: %s', env.outputPath)
  await writeBenchmarkOutput(
    env.outputPath,
    getBenchmarkOutput(benchmark.id, sorted, {
      baseDirectory: path.dirname(env.outputPath),
    }),
  )

  const resultSummaries = formatBenchmarkResults(benchmark, sorted)
  console.log(resultSummaries)

  if (GITHUB_STEP_SUMMARY) {
    await fs.appendFile(GITHUB_STEP_SUMMARY, `## Benchmark results\n\n\`\`\`\n${resultSummaries}\n\`\`\`\n`)
  }
} else if (mode.kind === 'experiment') {
  requireCopilotToken(COPILOT_GITHUB_TOKEN)
  logger.info('Running experiment: %s', mode.id)

  const experiment = await getExperiment({
    experimentsDirectory: env.experimentsDirectory,
    scenariosDirectory: env.scenariosDirectory,
    id: mode.id,
  })
  const result = await runExperiment({
    env,
    id: mode.id,
  })
  const sorted = result.toSorted(compareTrial)

  logger.info('Writing experiment output to: %s', env.outputPath)

  const output = getExperimentOutput(experiment.id, sorted, {
    baseDirectory: path.dirname(env.outputPath),
  })

  await writeExperimentOutput(env.outputPath, output)

  const resultSummaries = formatExperimentResults(experiment.name, sorted)
  console.log(resultSummaries)

  if (GITHUB_STEP_SUMMARY) {
    await fs.appendFile(GITHUB_STEP_SUMMARY, `## Experiment results\n\n\`\`\`\n${resultSummaries}\n\`\`\`\n`)
  }
} else if (mode.kind === 'from-plan') {
  requireCopilotToken(COPILOT_GITHUB_TOKEN)
  const planPath = path.resolve(mode.path)
  const durablePlan = deserializePlan(await fs.readFile(planPath, 'utf-8'))
  const plan = shard ? selectDurablePlan(durablePlan, shard) : durablePlan

  if (isBenchmarkPlan(plan)) {
    await runBenchmarkFromPlan(plan)
  } else {
    await runExperimentFromPlan(plan)
  }
} else {
  displayHelp()
}

function requireCopilotToken(token: string | undefined): asserts token is string {
  if (!token) {
    throw new Error('COPILOT_GITHUB_TOKEN environment variable is required to run agent-eval')
  }
}

function selectDurablePlan(plan: Plan, selectedShard: ReturnType<typeof parseShard>): Plan {
  if (isBenchmarkPlan(plan)) {
    return selectPlan(plan, selectedShard)
  }

  return selectPlan(plan, selectedShard)
}

async function ensureParentDirectory(filepath: string): Promise<void> {
  await fs.mkdir(path.dirname(filepath), {recursive: true})
}

async function runBenchmarkFromPlan(plan: BenchmarkPlan): Promise<void> {
  logger.info('Running benchmark plan: %s', plan.source.id)

  const benchmark = await getBenchmark({
    benchmarksDirectory: env.benchmarksDirectory,
    scenariosDirectory: env.scenariosDirectory,
    id: plan.source.id,
  })
  const result = await runBenchmark({
    env,
    plan,
  })
  const sorted = result.toSorted(compareTrial)

  await ensureParentDirectory(env.outputPath)
  await writeBenchmarkOutput(
    env.outputPath,
    getBenchmarkOutput(benchmark.id, sorted, {
      baseDirectory: path.dirname(env.outputPath),
    }),
  )

  const resultSummaries = formatBenchmarkResults(benchmark, sorted)
  console.log(resultSummaries)

  if (GITHUB_STEP_SUMMARY) {
    await fs.appendFile(GITHUB_STEP_SUMMARY, `## Benchmark results\n\n\`\`\`\n${resultSummaries}\n\`\`\`\n`)
  }
}

async function runExperimentFromPlan(plan: ExperimentPlan): Promise<void> {
  logger.info('Running experiment plan: %s', plan.source.id)

  const experiment = await getExperiment({
    experimentsDirectory: env.experimentsDirectory,
    scenariosDirectory: env.scenariosDirectory,
    id: plan.source.id,
  })
  const result = await runExperiment({
    env,
    plan,
  })
  const sorted = result.toSorted(compareTrial)
  const output = getExperimentOutput(experiment.id, sorted, {
    baseDirectory: path.dirname(env.outputPath),
  })

  await ensureParentDirectory(env.outputPath)
  await writeExperimentOutput(env.outputPath, output)

  const resultSummaries = formatExperimentResults(experiment.name, sorted)
  console.log(resultSummaries)

  if (GITHUB_STEP_SUMMARY) {
    await fs.appendFile(GITHUB_STEP_SUMMARY, `## Experiment results\n\n\`\`\`\n${resultSummaries}\n\`\`\`\n`)
  }
}
