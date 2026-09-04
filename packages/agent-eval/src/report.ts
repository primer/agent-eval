import type {Model, ReasoningEffort} from './model'
import type {Benchmark, BenchmarkTrialResult} from './benchmark'
import type {TrialResult} from './trial'

type ResultSummary = {
  experiment: string
  treatment?: string
  scenario?: string
  model?: Model
  reasoningEffort?: ReasoningEffort<Model>
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
  scenario?: string
  model?: Model
  reasoningEffort?: ReasoningEffort<Model>
}

type ResultHierarchy = Array<{
  experiment: string
  treatments: Array<{
    summary: ResultSummary
    scenarios: Array<{
      summary: ResultSummary
      models: Array<ResultSummary>
    }>
  }>
}>

type TableRow = Record<string, string | number>

type BenchmarkComparison = {
  benchmark: string
  capability: string
  scenario?: string
  model?: Model
  reasoningEffort?: ReasoningEffort<Model>
  control: ResultSummary
  benchmarkTreatment: ResultSummary
}

function createResultSummary(experiment: string, values: ResultSummaryValues = {}): ResultSummary {
  return {
    experiment,
    treatment: values.treatment,
    scenario: values.scenario,
    model: values.model,
    reasoningEffort: values.reasoningEffort,
    runs: 0,
    numPassedTests: 0,
    numTotalTests: 0,
    outputTokens: 0,
    premiumRequests: 0,
    sessionDurationMs: 0,
    totalApiDurationMs: 0,
  }
}

function addResultToSummary(summary: ResultSummary, result: TrialResult): void {
  summary.runs += 1
  summary.numPassedTests += result.testResults.numPassedTests
  summary.numTotalTests += result.testResults.numTotalTests

  for (const session of result.agent.sessions) {
    summary.outputTokens += session.outputTokens
    summary.premiumRequests += session.premiumRequests
    summary.sessionDurationMs += session.sessionDurationMs
    summary.totalApiDurationMs += session.totalApiDurationMs
  }
}

function getSuccessRate(summary: ResultSummary): number {
  if (summary.numTotalTests === 0) {
    return 0
  }

  return summary.numPassedTests / summary.numTotalTests
}

function compareSummaries(a: ResultSummary, b: ResultSummary): number {
  return (
    getSuccessRate(b) - getSuccessRate(a) ||
    a.outputTokens - b.outputTokens ||
    a.sessionDurationMs - b.sessionDurationMs ||
    a.premiumRequests - b.premiumRequests ||
    a.experiment.localeCompare(b.experiment) ||
    (a.treatment ?? '').localeCompare(b.treatment ?? '') ||
    (a.scenario ?? '').localeCompare(b.scenario ?? '') ||
    (a.model ?? '').localeCompare(b.model ?? '') ||
    (a.reasoningEffort ?? '').localeCompare(b.reasoningEffort ?? '')
  )
}

function getSummaryKey(experiment: string, values: ResultSummaryValues = {}): string {
  return [
    experiment,
    values.treatment ?? '',
    values.scenario ?? '',
    values.model ?? '',
    values.reasoningEffort ?? '',
  ].join('\0')
}

function getResultSummaries(experiment: string, results: Array<TrialResult>): ResultHierarchy {
  const treatmentSummaries = new Map<string, ResultSummary>()
  const scenarioSummaries = new Map<string, ResultSummary>()
  const modelSummaries = new Map<string, ResultSummary>()

  for (const result of results) {
    const treatmentValues = {
      treatment: result.trial.treatment.name,
    }
    const treatmentKey = getSummaryKey(experiment, treatmentValues)
    const treatmentSummary = treatmentSummaries.get(treatmentKey) ?? createResultSummary(experiment, treatmentValues)
    addResultToSummary(treatmentSummary, result)
    treatmentSummaries.set(treatmentKey, treatmentSummary)

    const scenarioValues = {
      treatment: result.trial.treatment.name,
      scenario: result.trial.scenario.id,
    }
    const scenarioKey = getSummaryKey(experiment, scenarioValues)
    const scenarioSummary = scenarioSummaries.get(scenarioKey) ?? createResultSummary(experiment, scenarioValues)
    addResultToSummary(scenarioSummary, result)
    scenarioSummaries.set(scenarioKey, scenarioSummary)

    const modelValues = {
      treatment: result.trial.treatment.name,
      scenario: result.trial.scenario.id,
      model: result.trial.model.name,
      reasoningEffort: result.trial.model.reasoningEffort,
    }
    const modelKey = getSummaryKey(experiment, modelValues)
    const modelSummary = modelSummaries.get(modelKey) ?? createResultSummary(experiment, modelValues)
    addResultToSummary(modelSummary, result)
    modelSummaries.set(modelKey, modelSummary)
  }

  return [
    {
      experiment,
      treatments: [...treatmentSummaries.values()].toSorted(compareSummaries).map(summary => {
        return {
          summary,
          scenarios: [...scenarioSummaries.values()]
            .filter(scenarioSummary => {
              return scenarioSummary.treatment === summary.treatment
            })
            .toSorted(compareSummaries)
            .map(scenarioSummary => {
              return {
                summary: scenarioSummary,
                models: [...modelSummaries.values()]
                  .filter(modelSummary => {
                    return (
                      modelSummary.treatment === summary.treatment && modelSummary.scenario === scenarioSummary.scenario
                    )
                  })
                  .toSorted(compareSummaries),
              }
            }),
        }
      }),
    },
  ]
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

function formatTable(rows: Array<TableRow>, columns: Array<string>): string {
  const columnWidths = columns.map(column => {
    let width = column.length

    for (const row of rows) {
      width = Math.max(width, String(row[column] ?? '').length)
    }

    return width
  })

  const formatRow = (row: TableRow): string => {
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

function formatSummaryRow(summary: ResultSummary, level: 'treatment' | 'scenario' | 'model'): TableRow {
  return {
    Experiment: level === 'treatment' ? summary.experiment : '',
    Treatment: level === 'treatment' ? (summary.treatment ?? '') : '',
    Scenario: level === 'treatment' ? 'All scenarios' : level === 'scenario' ? `  ${summary.scenario ?? ''}` : '',
    Model: level === 'model' ? `    ${summary.model ?? ''}` : 'All models',
    'Reasoning Effort': level === 'model' ? (summary.reasoningEffort ?? '') : '',
    'Success Rate': formatPercent(getSuccessRate(summary)),
    Tests: `${summary.numPassedTests}/${summary.numTotalTests}`,
    Runs: summary.runs,
    'Output Tokens': formatNumber(summary.outputTokens),
    'Premium Requests': formatNumber(summary.premiumRequests),
    'Session Time': formatDuration(summary.sessionDurationMs),
    'API Time': formatDuration(summary.totalApiDurationMs),
  }
}

function formatPercentDelta(control: number, benchmark: number): string {
  if (control === benchmark) {
    return '0%'
  }

  if (control === 0) {
    return 'N/A'
  }

  const delta = (benchmark - control) / control
  const sign = delta > 0 ? '+' : ''
  return `${sign}${(delta * 100).toFixed(1)}%`
}

function formatBenchmarkValue(value: string, control: number, benchmark: number): string {
  return `${value} (${formatPercentDelta(control, benchmark)})`
}

function compareBenchmarkModelPerformance(a: ResultSummary, b: ResultSummary): number {
  return (
    getSuccessRate(b) - getSuccessRate(a) ||
    a.outputTokens - b.outputTokens ||
    a.premiumRequests - b.premiumRequests ||
    a.sessionDurationMs - b.sessionDurationMs ||
    a.totalApiDurationMs - b.totalApiDurationMs
  )
}

function getBenchmarkComparisons(
  benchmark: Pick<Benchmark, 'name' | 'capabilities'>,
  results: Array<BenchmarkTrialResult>,
): Array<BenchmarkComparison> {
  const comparisons = new Map<string, BenchmarkComparison>()

  for (const result of results) {
    const values = [
      {
        key: result.capability.name,
        scenario: undefined,
      },
      {
        key: `${result.capability.name}\0${result.trial.scenario.id}`,
        scenario: result.trial.scenario.id,
      },
      {
        key: [
          result.capability.name,
          result.trial.scenario.id,
          result.trial.model.name,
          result.trial.model.reasoningEffort,
        ].join('\0'),
        scenario: result.trial.scenario.id,
        model: result.trial.model.name,
        reasoningEffort: result.trial.model.reasoningEffort,
      },
    ]

    for (const value of values) {
      const comparison = comparisons.get(value.key) ?? {
        benchmark: benchmark.name,
        capability: result.capability.name,
        scenario: value.scenario,
        model: value.model,
        reasoningEffort: value.reasoningEffort,
        control: createResultSummary(benchmark.name),
        benchmarkTreatment: createResultSummary(benchmark.name),
      }
      const summary = result.trial.treatment.name === 'Control' ? comparison.control : comparison.benchmarkTreatment
      addResultToSummary(summary, result)
      comparisons.set(value.key, comparison)
    }
  }

  const capabilityOrder = new Map(
    benchmark.capabilities.map((capability, index) => {
      return [capability.name, index]
    }),
  )
  const scenarioOrder = new Map(
    benchmark.capabilities.map(capability => {
      return [
        capability.name,
        new Map(
          capability.scenarios.map((scenario, index) => {
            return [scenario.id, index]
          }),
        ),
      ]
    }),
  )

  return [...comparisons.values()].toSorted((a, b) => {
    const capabilityDifference =
      (capabilityOrder.get(a.capability) ?? Number.MAX_SAFE_INTEGER) -
      (capabilityOrder.get(b.capability) ?? Number.MAX_SAFE_INTEGER)
    if (capabilityDifference !== 0) {
      return capabilityDifference
    }

    const scenarioDifference =
      Number(Boolean(a.scenario)) - Number(Boolean(b.scenario)) ||
      (scenarioOrder.get(a.capability)?.get(a.scenario ?? '') ?? Number.MAX_SAFE_INTEGER) -
        (scenarioOrder.get(b.capability)?.get(b.scenario ?? '') ?? Number.MAX_SAFE_INTEGER) ||
      (a.scenario ?? '').localeCompare(b.scenario ?? '')
    if (scenarioDifference !== 0) {
      return scenarioDifference
    }

    const modelDifference = Number(Boolean(a.model)) - Number(Boolean(b.model))
    if (modelDifference !== 0) {
      return modelDifference
    }

    if (a.model && b.model) {
      return (
        compareBenchmarkModelPerformance(a.benchmarkTreatment, b.benchmarkTreatment) ||
        a.model.localeCompare(b.model) ||
        (a.reasoningEffort ?? '').localeCompare(b.reasoningEffort ?? '')
      )
    }

    return (
      a.capability.localeCompare(b.capability) ||
      (a.scenario ?? '').localeCompare(b.scenario ?? '') ||
      (a.model ?? '').localeCompare(b.model ?? '')
    )
  })
}

function formatBenchmarkComparison(comparison: BenchmarkComparison): TableRow {
  return {
    Benchmark: comparison.scenario ? '' : comparison.benchmark,
    Capability: comparison.scenario ? '' : comparison.capability,
    Scenario: comparison.model ? '' : comparison.scenario ? `  ${comparison.scenario}` : 'All scenarios',
    Model: comparison.model ? `    ${comparison.model}` : 'All models',
    'Reasoning Effort': comparison.reasoningEffort ?? '',
    Tests: formatBenchmarkValue(
      `${comparison.benchmarkTreatment.numPassedTests}/${comparison.benchmarkTreatment.numTotalTests}`,
      getSuccessRate(comparison.control),
      getSuccessRate(comparison.benchmarkTreatment),
    ),
    'Output Tokens': formatBenchmarkValue(
      formatNumber(comparison.benchmarkTreatment.outputTokens),
      comparison.control.outputTokens,
      comparison.benchmarkTreatment.outputTokens,
    ),
    'Premium Requests': formatBenchmarkValue(
      formatNumber(comparison.benchmarkTreatment.premiumRequests),
      comparison.control.premiumRequests,
      comparison.benchmarkTreatment.premiumRequests,
    ),
    'Session Time': formatBenchmarkValue(
      formatDuration(comparison.benchmarkTreatment.sessionDurationMs),
      comparison.control.sessionDurationMs,
      comparison.benchmarkTreatment.sessionDurationMs,
    ),
    'API Time': formatBenchmarkValue(
      formatDuration(comparison.benchmarkTreatment.totalApiDurationMs),
      comparison.control.totalApiDurationMs,
      comparison.benchmarkTreatment.totalApiDurationMs,
    ),
  }
}

function formatBenchmarkResults(
  benchmark: Pick<Benchmark, 'name' | 'capabilities'>,
  results: Array<BenchmarkTrialResult>,
): string {
  const columns = [
    'Benchmark',
    'Capability',
    'Scenario',
    'Model',
    'Reasoning Effort',
    'Tests',
    'Output Tokens',
    'Premium Requests',
    'Session Time',
    'API Time',
  ]
  const rows = getBenchmarkComparisons(benchmark, results).map(formatBenchmarkComparison)

  return formatTable(rows, columns)
}

function formatExperimentResults(experiment: string, results: Array<TrialResult>): string {
  const columns = [
    'Experiment',
    'Treatment',
    'Scenario',
    'Model',
    'Reasoning Effort',
    'Success Rate',
    'Tests',
    'Runs',
    'Output Tokens',
    'Premium Requests',
    'Session Time',
    'API Time',
  ]
  const rows: Array<TableRow> = []

  for (const {treatments} of getResultSummaries(experiment, results)) {
    for (const {summary, scenarios} of treatments) {
      rows.push(formatSummaryRow(summary, 'treatment'))

      for (const {summary: scenarioSummary, models} of scenarios) {
        rows.push(formatSummaryRow(scenarioSummary, 'scenario'))

        for (const model of models) {
          rows.push(formatSummaryRow(model, 'model'))
        }
      }
    }
  }

  return formatTable(rows, columns)
}

export {formatBenchmarkResults, formatExperimentResults}
