#!/usr/bin/env node
import {randomUUID} from 'node:crypto'
import {existsSync} from 'node:fs'
import path from 'node:path'
import fs from 'node:fs/promises'
import {parseArgs} from 'node:util'
import {get as getEval} from '@primer/agent-evals'
import {ControlTreatment, type ExperimentConfig, type Model} from '@primer/agent-experiment'
import type {Treatment, TreatmentResult} from './treatment'
import {listExperiments, loadExperimentConfigs} from './experiments.ts'
import {run} from './run'

const COPILOT_GITHUB_TOKEN = process.env.COPILOT_GITHUB_TOKEN
const GITHUB_STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY

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
    experiments: {
      type: 'string',
      description: 'The directory containing local experiment files',
    },
  },
})

const ARTIFACTS_DIR = path.resolve(values.artifacts ?? 'artifacts')
const parsedConcurrency = values.concurrency ? parseInt(values.concurrency, 10) : 1
const MAX_CONCURRENCY =
  Number.isFinite(parsedConcurrency) && Number.isInteger(parsedConcurrency) && parsedConcurrency >= 1
    ? parsedConcurrency
    : 1
let experimentConfigs: Array<ExperimentConfig> = []

if (!existsSync(ARTIFACTS_DIR)) {
  await fs.mkdir(ARTIFACTS_DIR, {recursive: true})
}

if (values.experiment) {
  experimentConfigs = await loadExperimentConfigs({
    experiment: values.experiment,
    experimentsDirectory: values.experiments,
  })
  if (experimentConfigs.length === 0) {
    console.log('Experiments:')
    console.log(
      (
        await listExperiments({
          experimentsDirectory: values.experiments,
        })
      )
        .map(([name]) => name)
        .join('\n'),
    )
  }
} else {
  experimentConfigs = await loadExperimentConfigs({
    experimentsDirectory: values.experiments,
  })
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

async function appendResultsToJobSummary(resultSummaries: string) {
  if (!GITHUB_STEP_SUMMARY) {
    return
  }

  await fs.appendFile(GITHUB_STEP_SUMMARY, `## Experiment results\n\n\`\`\`\n${resultSummaries}\n\`\`\`\n`)
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
    artifactsDirectory: ARTIFACTS_DIR,
    copilotToken: COPILOT_GITHUB_TOKEN,
    maxConcurrency: MAX_CONCURRENCY,
  })
  results.push(...runResults)
}

const sortedResults = results.toSorted(compareResults)
const resultSummaries = formatResultSummaries(sortedResults)
console.log(resultSummaries)
await appendResultsToJobSummary(resultSummaries)

await fs.writeFile('results.json', JSON.stringify(sortedResults, null, 2))
