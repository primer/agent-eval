import {get as getEval} from '@primer/agent-evals'
import type {Eval} from '@primer/agent-evals'
import {list, find} from '@primer/agent-experiments'
import type {ExperimentConfig, Model, TreatmentConfig} from '@primer/agent-experiments'
import {AGENTS_DIR, CONTAINER_WORKDIR, COPILOT_DIR, NODE_USER, Sandbox} from '@primer/agent-sandbox'
import {randomUUID} from 'node:crypto'
import {existsSync} from 'node:fs'
import fs from 'node:fs/promises'
import {parseArgs} from 'node:util'
import {parseMessage, type Message} from './copilot-cli'
import {parseTestResults} from './vitest'
import path from 'node:path'

const COPILOT_GITHUB_TOKEN = process.env.COPILOT_GITHUB_TOKEN

if (!COPILOT_GITHUB_TOKEN) {
  throw new Error('COPILOT_GITHUB_TOKEN environment variable is required to run the experiments')
}

const {values} = parseArgs({
  options: {
    artifacts: {
      type: 'string',
      short: 'a',
      description: 'The directory to save artifacts to',
    },
    concurrency: {
      type: 'string',
      short: 'c',
      description: 'The number of treatments to run in parallel',
    },
    experiment: {
      type: 'string',
      short: 'e',
      description: 'The file name of the experiment to run',
    },
  },
})

const ARTIFACTS_DIR = path.resolve(values.artifacts ?? 'artifacts')
const parsedConcurrency = values.concurrency ? parseInt(values.concurrency, 10) : 1
const MAX_CONCURRENCY =
  Number.isFinite(parsedConcurrency) && Number.isInteger(parsedConcurrency) && parsedConcurrency >= 1
    ? parsedConcurrency
    : 1
const experimentConfigs: Array<ExperimentConfig> = []

if (!existsSync(ARTIFACTS_DIR)) {
  await fs.mkdir(ARTIFACTS_DIR, {recursive: true})
}

if (values.experiment) {
  const experiment = find(values.experiment)
  if (experiment) {
    experimentConfigs.push(experiment)
  } else {
    console.log('Experiments:')
    console.log(
      list()
        .map(([name]) => name)
        .join('\n'),
    )
  }
}

const ControlTreatment: TreatmentConfig = {
  name: 'Control',
}

type Treatment = {
  config: TreatmentConfig
  eval: Eval
  experiment: ExperimentConfig
  id: string
  model: Model
}

type TreatmentResult = {
  id: string
  treatment: Treatment
  artifacts: {
    copilotConfigPath: string
    directory: string
    skillsConfigPath: string
    testResultsPath: string
    workspacePath: string
  }
  assistant: {
    turns: number
    outputTokens: number
    premiumRequests: number
    totalApiDurationMs: number
    sessionDurationMs: number
    tools: Record<string, number>
  }
  testResults: {
    numTotalTests: number
    numPassedTests: number
    numFailedTests: number
    numPendingTests: number
    numTodoTests: number
  }
}

function randomize<T>(input: Array<T>): Array<T> {
  const randomized: Array<T> = input.slice()

  // Fisher–Yates shuffle
  for (let i = randomized.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[randomized[i], randomized[j]] = [randomized[j], randomized[i]]
  }

  return randomized
}

function getSuccessRate(result: TreatmentResult): number {
  if (result.testResults.numTotalTests === 0) {
    return 0
  }

  return result.testResults.numPassedTests / result.testResults.numTotalTests
}

function compareResults(a: TreatmentResult, b: TreatmentResult): number {
  return (
    getSuccessRate(b) - getSuccessRate(a) ||
    a.assistant.outputTokens - b.assistant.outputTokens ||
    a.assistant.sessionDurationMs - b.assistant.sessionDurationMs ||
    a.assistant.premiumRequests - b.assistant.premiumRequests ||
    a.treatment.experiment.name.localeCompare(b.treatment.experiment.name) ||
    a.treatment.config.name.localeCompare(b.treatment.config.name) ||
    a.treatment.model.localeCompare(b.treatment.model) ||
    a.treatment.eval.id.localeCompare(b.treatment.eval.id)
  )
}

type ResultSummary = {
  experiment: string
  treatment?: string
  eval?: string
  model?: Model
  runs: number
  numPassedTests: number
  numTotalTests: number
  outputTokens: number
  premiumRequests: number
  sessionDurationMs: number
  totalApiDurationMs: number
}

type ResultSummaryValues = {
  treatment?: string
  eval?: string
  model?: Model
}

function createResultSummary(result: TreatmentResult, summaryValues: ResultSummaryValues = {}): ResultSummary {
  return {
    experiment: result.treatment.experiment.name,
    treatment: summaryValues.treatment,
    eval: summaryValues.eval,
    model: summaryValues.model,
    runs: 0,
    numPassedTests: 0,
    numTotalTests: 0,
    outputTokens: 0,
    premiumRequests: 0,
    sessionDurationMs: 0,
    totalApiDurationMs: 0,
  }
}

function addResultToSummary(summary: ResultSummary, result: TreatmentResult) {
  summary.runs += 1
  summary.numPassedTests += result.testResults.numPassedTests
  summary.numTotalTests += result.testResults.numTotalTests
  summary.outputTokens += result.assistant.outputTokens
  summary.premiumRequests += result.assistant.premiumRequests
  summary.sessionDurationMs += result.assistant.sessionDurationMs
  summary.totalApiDurationMs += result.assistant.totalApiDurationMs
}

function getSummarySuccessRate(summary: ResultSummary): number {
  if (summary.numTotalTests === 0) {
    return 0
  }

  return summary.numPassedTests / summary.numTotalTests
}

function compareSummaries(a: ResultSummary, b: ResultSummary): number {
  return (
    getSummarySuccessRate(b) - getSummarySuccessRate(a) ||
    a.outputTokens - b.outputTokens ||
    a.sessionDurationMs - b.sessionDurationMs ||
    a.premiumRequests - b.premiumRequests ||
    a.experiment.localeCompare(b.experiment) ||
    (a.treatment ?? '').localeCompare(b.treatment ?? '') ||
    (a.eval ?? '').localeCompare(b.eval ?? '') ||
    (a.model ?? '').localeCompare(b.model ?? '')
  )
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatDuration(ms: number): string {
  const seconds = ms / 1000

  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds - minutes * 60
  return `${minutes}m ${remainingSeconds.toFixed(1)}s`
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

type TableRow = Record<string, string | number>

function formatTable(rows: Array<TableRow>, columns: Array<string>): string {
  const columnWidths = columns.map(column => {
    let width = column.length

    for (const row of rows) {
      width = Math.max(width, String(row[column] ?? '').length)
    }

    return width
  })

  const formatRow = (row: TableRow) => {
    return columns
      .map((column, index) => {
        return String(row[column] ?? '').padEnd(columnWidths[index])
      })
      .join('  ')
  }

  return [
    formatRow(Object.fromEntries(columns.map(column => [column, column]))),
    columnWidths.map(width => '-'.repeat(width)).join('  '),
    ...rows.map(formatRow),
  ].join('\n')
}

function getSummaryKey(result: TreatmentResult, summaryValues: ResultSummaryValues = {}): string {
  return [
    result.treatment.experiment.name,
    summaryValues.treatment ?? '',
    summaryValues.eval ?? '',
    summaryValues.model ?? '',
  ].join('\0')
}

type ResultHierarchy = Array<{
  experiment: string
  treatments: Array<{
    summary: ResultSummary
    evals: Array<{
      summary: ResultSummary
      models: Array<ResultSummary>
    }>
  }>
}>

function getResultSummaries(results: Array<TreatmentResult>): ResultHierarchy {
  const experiments = new Set<string>()
  const treatmentSummaries = new Map<string, ResultSummary>()
  const evalSummaries = new Map<string, ResultSummary>()
  const modelSummaries = new Map<string, ResultSummary>()

  for (const result of results) {
    experiments.add(result.treatment.experiment.name)

    const treatmentValues = {
      treatment: result.treatment.config.name,
    }
    const treatmentKey = getSummaryKey(result, treatmentValues)
    const treatmentSummary = treatmentSummaries.get(treatmentKey) ?? createResultSummary(result, treatmentValues)
    addResultToSummary(treatmentSummary, result)
    treatmentSummaries.set(treatmentKey, treatmentSummary)

    const evalValues = {
      treatment: result.treatment.config.name,
      eval: result.treatment.eval.id,
    }
    const evalKey = getSummaryKey(result, evalValues)
    const evalSummary = evalSummaries.get(evalKey) ?? createResultSummary(result, evalValues)
    addResultToSummary(evalSummary, result)
    evalSummaries.set(evalKey, evalSummary)

    const modelValues = {
      treatment: result.treatment.config.name,
      eval: result.treatment.eval.id,
      model: result.treatment.model,
    }
    const modelKey = getSummaryKey(result, modelValues)
    const modelSummary = modelSummaries.get(modelKey) ?? createResultSummary(result, modelValues)
    addResultToSummary(modelSummary, result)
    modelSummaries.set(modelKey, modelSummary)
  }

  return [...experiments].toSorted().map(experiment => {
    return {
      experiment,
      treatments: [...treatmentSummaries.values()]
        .filter(treatmentSummary => {
          return treatmentSummary.experiment === experiment
        })
        .toSorted(compareSummaries)
        .map(summary => {
          return {
            summary,
            evals: [...evalSummaries.values()]
              .filter(evalSummary => {
                return evalSummary.experiment === experiment && evalSummary.treatment === summary.treatment
              })
              .toSorted(compareSummaries)
              .map(evalSummary => {
                return {
                  summary: evalSummary,
                  models: [...modelSummaries.values()]
                    .filter(modelSummary => {
                      return (
                        modelSummary.experiment === experiment &&
                        modelSummary.treatment === summary.treatment &&
                        modelSummary.eval === evalSummary.eval
                      )
                    })
                    .toSorted(compareSummaries),
                }
              }),
          }
        }),
    }
  })
}

function formatResultSummaries(results: Array<TreatmentResult>): string {
  const columns = [
    'Experiment',
    'Treatment',
    'Eval',
    'Model',
    'Success Rate',
    'Tests',
    'Runs',
    'Output Tokens',
    'Premium Requests',
    'Session Time',
    'API Time',
  ]
  const rows: Array<TableRow> = []

  for (const {treatments} of getResultSummaries(results)) {
    for (const {summary, evals} of treatments) {
      rows.push(formatSummaryRow(summary, 'treatment'))

      for (const {summary: evalSummary, models} of evals) {
        rows.push(formatSummaryRow(evalSummary, 'eval'))

        for (const model of models) {
          rows.push(formatSummaryRow(model, 'model'))
        }
      }
    }
  }

  return formatTable(rows, columns)
}

function formatSummaryRow(summary: ResultSummary, level: 'treatment' | 'eval' | 'model'): TableRow {
  return {
    Experiment: level === 'treatment' ? summary.experiment : '',
    Treatment: level === 'treatment' ? (summary.treatment ?? '') : '',
    Eval: level === 'treatment' ? 'All evals' : level === 'eval' ? `  ${summary.eval ?? ''}` : '',
    Model: level === 'model' ? `    ${summary.model ?? ''}` : 'All models',
    'Success Rate': formatPercent(getSummarySuccessRate(summary)),
    Tests: `${summary.numPassedTests}/${summary.numTotalTests}`,
    Runs: summary.runs,
    'Output Tokens': formatNumber(summary.outputTokens),
    'Premium Requests': formatNumber(summary.premiumRequests),
    'Session Time': formatDuration(summary.sessionDurationMs),
    'API Time': formatDuration(summary.totalApiDurationMs),
  }
}

type RunOptions = {
  maxConcurrency?: number
}

function run(treatments: Array<Treatment>, options?: RunOptions): Promise<Array<TreatmentResult>> {
  const maxConcurrency = options?.maxConcurrency ?? 1
  const queue = treatments.slice()
  const results: Array<TreatmentResult> = []
  const pending = new Set()
  let cancelled = false

  let resolve: (value: Array<TreatmentResult>) => void
  let reject: (reason: unknown) => void
  const deferred = new Promise<Array<TreatmentResult>>((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })

  function execute() {
    if (cancelled) {
      return
    }

    if (queue.length === 0) {
      if (pending.size === 0) {
        resolve(results)
      }
      return
    }

    if (pending.size >= maxConcurrency) {
      return
    }

    const treatment = queue.shift()
    if (!treatment) {
      return
    }

    const promise = retry(() => runTreatment(treatment), 3).then(
      result => {
        results.push(result)
        pending.delete(promise)
        execute()
      },
      error => {
        cancelled = true
        pending.delete(promise)
        reject(error)
      },
    )

    pending.add(promise)
    execute()
  }

  execute()

  return deferred
}

async function retry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (retries > 0) {
      console.log('Retrying after error: %s', error)
      return retry(fn, retries - 1)
    }
    throw error
  }
}

async function runTreatment(treatment: Treatment): Promise<TreatmentResult> {
  console.log('Running treatment: %s (%s)', treatment.config.name, treatment.id)
  await using sandbox = await Sandbox.create()

  console.log('Copying files from: %s...', treatment.eval.directory)
  await sandbox.copy(treatment.eval.directory, CONTAINER_WORKDIR, {
    exclude: ['eval.config.ts', 'eval.test.ts', 'node_modules', '.next'],
  })
  await sandbox.runCommand('chown', ['-R', NODE_USER, '.'], {
    user: 'root',
  })

  console.log('Obfuscating package name...')
  await sandbox.runCommand('npm', ['pkg', 'set', `name=${treatment.id}`], {
    user: NODE_USER,
  })

  console.log('Removing workspace dependency...')
  await sandbox.runCommand('npm', ['pkg', 'delete', 'devDependencies.@primer/agent-eval'], {
    user: NODE_USER,
  })

  console.log('Installing dependencies...')
  await sandbox.runCommand('npm', ['install'], {
    user: NODE_USER,
  })

  console.log('Running treatment setup...')
  await treatment.config.setup?.({
    sandbox,
  })

  console.log('Run build script...')
  await sandbox.runCommand('npm', ['run', 'build', '--if-present'], {
    user: NODE_USER,
  })

  console.log('Running copilot...')
  const {prompt} = treatment.eval.config
  const args = [
    '-p',
    prompt,
    '--model',
    treatment.model,
    '--allow-all',
    '--reasoning-effort',
    'high',
    '--mode',
    'autopilot',
    '--output-format',
    'json',
  ]
  const copilotOutput = await sandbox.runCommand('copilot', args, {
    user: NODE_USER,
    env: {
      COPILOT_GITHUB_TOKEN: COPILOT_GITHUB_TOKEN!,
    },
  })
  const messages: Array<Message> = copilotOutput.stdout.split('\n').flatMap(line => {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      return []
    }
    const result = parseMessage(JSON.parse(trimmed))
    if (result.success) {
      return result.data
    }
    console.log('Failed to parse copilot message: %s', line)
    return []
  })

  const TEST_PATH = 'eval.test.ts'
  await sandbox.copy(treatment.eval.testPath, TEST_PATH)
  // Always pass vitest calls even if test suite fails
  await sandbox.runCommand(
    'sh',
    ['-c', 'npx vitest run "$1" --reporter json --outputFile test-results.json || true', 'vitest-run', TEST_PATH],
    {
      user: NODE_USER,
    },
  )

  const testResultsContent = await sandbox.readFile('test-results.json')
  const testResults = parseTestResults(JSON.parse(testResultsContent))
  if (!testResults.success) {
    throw new Error(`Failed to parse test results: ${testResults.error}`)
  }

  // Turns
  const assistantTurns = new Set()
  // Tools
  const toolCalls = new Map()
  let outputTokens = 0

  for (const message of messages) {
    if (message.type === 'assistant.turn_start') {
      assistantTurns.add(message.data.turnId)
    }

    if (message.type === 'assistant.message') {
      outputTokens += message.data.outputTokens
    }

    if (message.type === 'tool.execution_start') {
      const toolName = message.data.toolName
      toolCalls.set(toolName, (toolCalls.get(toolName) ?? 0) + 1)
    }
  }

  const result = messages.find((message): message is Extract<Message, {type: 'result'}> => {
    return message.type === 'result'
  })
  if (!result) {
    throw new Error('No result message found in copilot output')
  }

  const artifactDirectory = path.join(ARTIFACTS_DIR, treatment.id)
  const workspacePath = path.join(artifactDirectory, 'workspace')
  const copilotConfigPath = path.join(artifactDirectory, '.copilot')
  const skillsConfigPath = path.join(artifactDirectory, '.agents')
  const testResultsPath = path.join(workspacePath, 'test-results.json')
  await fs.mkdir(workspacePath, {recursive: true})

  console.log('Downloading agent workspace to: %s...', workspacePath)
  await sandbox.download(CONTAINER_WORKDIR, workspacePath, {
    ignore(name) {
      return name.includes('node_modules') || name.includes('.next')
    },
  })

  console.log('Downloading copilot config to: %s...', copilotConfigPath)
  await sandbox.download(COPILOT_DIR, copilotConfigPath)

  console.log('Downloading skills config to: %s...', skillsConfigPath)
  await sandbox.download(AGENTS_DIR, skillsConfigPath)

  return {
    id: randomUUID(),
    treatment,
    artifacts: {
      directory: artifactDirectory,
      copilotConfigPath,
      skillsConfigPath,
      testResultsPath,
      workspacePath,
    },
    assistant: {
      turns: assistantTurns.size,
      outputTokens,
      premiumRequests: result.usage.premiumRequests,
      // Time to complete (latency)
      totalApiDurationMs: result.usage.totalApiDurationMs,
      sessionDurationMs: result.usage.sessionDurationMs,
      tools: Object.fromEntries(toolCalls),
    },
    testResults: {
      numFailedTests: testResults.data.numFailedTests,
      numPassedTests: testResults.data.numPassedTests,
      numPendingTests: testResults.data.numPendingTests,
      numTodoTests: testResults.data.numTodoTests,
      numTotalTests: testResults.data.numTotalTests,
    },
  }
}

const results: Array<TreatmentResult> = []

for (const config of experimentConfigs) {
  console.log('Running experiment:', config.name)

  const treatments: Array<Treatment> = config.models.flatMap(model => {
    return config.evals.flatMap(evalId => {
      return [
        {
          config: ControlTreatment,
          eval: getEval(evalId),
          experiment: config,
          id: randomUUID(),
          model,
        },
        ...config.treatments.map(treatment => {
          return {
            config: treatment,
            eval: getEval(evalId),
            experiment: config,
            id: randomUUID(),
            model,
          }
        }),
      ]
    })
  })

  // Randomize treatments to mitigate any ordering effects. We want to make sure
  // that if there are any external factors that could impact the evals (e.g.
  // rate limits, resource constraints), they are more likely to impact all
  // evals rather than just the ones at the end.
  const runResults = await run(randomize(treatments), {
    maxConcurrency: MAX_CONCURRENCY,
  })
  results.push(...runResults)
}

const sortedResults = results.toSorted(compareResults)
console.log(formatResultSummaries(sortedResults))

await fs.writeFile('results.json', JSON.stringify(sortedResults, null, 2))
