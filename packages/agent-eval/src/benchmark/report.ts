import type {ModelVariant} from '../model'
import type {RunPlanResult} from '../plan'
import {formatDuration, formatNumber, formatPercentDelta, formatTable, type TableRow} from '../report/format'
import {ControlTreatment, getTreatmentId} from '../treatment'
import {
  REPORT_USAGE_NOTE,
  addTrialResultToSummary,
  compareTrialSummaries,
  createTrialSummary,
  type TrialSummary,
} from '../trial/report'
import type {Benchmark, Capability} from './benchmark'
import type {BenchmarkTrial} from './plan'

type BenchmarkComparison = {
  capability: Capability
  scenario?: string
  model?: ModelVariant
  control: TrialSummary
  benchmarkTreatment: TrialSummary
}

type CreateBenchmarkReportOptions = {
  benchmark: Benchmark
  runPlanResult: RunPlanResult<BenchmarkTrial>
}

type UsageMetric = 'outputTokens' | 'premiumRequests' | 'sessionDurationMs' | 'totalApiDurationMs'

function formatBenchmarkValue(
  comparison: BenchmarkComparison,
  metric: UsageMetric,
  format: (value: number) => string,
): string {
  if (comparison.benchmarkTreatment.runs === 0) {
    return 'N/A'
  }

  const value = format(comparison.benchmarkTreatment[metric])
  const delta =
    comparison.control.runs === 0
      ? 'N/A'
      : formatPercentDelta(comparison.control[metric], comparison.benchmarkTreatment[metric])
  return `${value} (${delta})`
}

function formatBenchmarkComparison(benchmark: Benchmark, comparison: BenchmarkComparison): TableRow {
  return {
    Benchmark: comparison.scenario ? '' : benchmark.name,
    Capability: comparison.scenario ? '' : comparison.capability.name,
    Scenario: comparison.model ? '' : comparison.scenario ? `  ${comparison.scenario}` : 'All scenarios',
    Model: comparison.model ? `    ${comparison.model.name}` : 'All models',
    'Reasoning Effort': comparison.model?.reasoningEffort ?? '',
    'Control Runs': comparison.control.runs,
    Runs: comparison.benchmarkTreatment.runs,
    'Output Tokens': formatBenchmarkValue(comparison, 'outputTokens', formatNumber),
    'Premium Requests': formatBenchmarkValue(comparison, 'premiumRequests', formatNumber),
    'Session Time': formatBenchmarkValue(comparison, 'sessionDurationMs', formatDuration),
    'API Time': formatBenchmarkValue(comparison, 'totalApiDurationMs', formatDuration),
  }
}

function createBenchmarkReport({benchmark, runPlanResult}: CreateBenchmarkReportOptions): string {
  if (runPlanResult.results.length === 0) {
    return `Benchmark: ${benchmark.name}\nNo trial results.`
  }

  const comparisons = new Map<string, BenchmarkComparison>()
  const benchmarkTreatmentId = getTreatmentId('Benchmark')

  for (const {trial, result} of runPlanResult.results) {
    if (trial.treatment.id !== ControlTreatment.id && trial.treatment.id !== benchmarkTreatmentId) {
      throw new Error(`Unexpected benchmark treatment for trial "${trial.id}": ${trial.treatment.name}`)
    }

    const values: Array<{scenario?: string; model?: ModelVariant}> = [
      {},
      {scenario: trial.scenario.id},
      {scenario: trial.scenario.id, model: trial.model},
    ]

    for (const value of values) {
      const key = JSON.stringify([trial.capability.id, value.scenario, value.model?.name, value.model?.reasoningEffort])
      const comparison = comparisons.get(key) ?? {
        capability: trial.capability,
        ...value,
        control: createTrialSummary(),
        benchmarkTreatment: createTrialSummary(),
      }
      const summary = trial.treatment.id === ControlTreatment.id ? comparison.control : comparison.benchmarkTreatment
      addTrialResultToSummary(summary, result)
      comparisons.set(key, comparison)
    }
  }

  const capabilityOrder = new Map(
    benchmark.capabilities.map((capability, index) => {
      return [capability.id, index]
    }),
  )
  const scenarioOrder = new Map(
    benchmark.capabilities.map(capability => {
      return [
        capability.id,
        new Map(
          capability.scenarios.map((scenario, index) => {
            return [scenario.id, index]
          }),
        ),
      ]
    }),
  )
  const ordered = [...comparisons.values()].toSorted((a, b) => {
    return (
      (capabilityOrder.get(a.capability.id) ?? Number.MAX_SAFE_INTEGER) -
        (capabilityOrder.get(b.capability.id) ?? Number.MAX_SAFE_INTEGER) ||
      a.capability.name.localeCompare(b.capability.name) ||
      Number(a.scenario !== undefined) - Number(b.scenario !== undefined) ||
      (scenarioOrder.get(a.capability.id)?.get(a.scenario ?? '') ?? Number.MAX_SAFE_INTEGER) -
        (scenarioOrder.get(b.capability.id)?.get(b.scenario ?? '') ?? Number.MAX_SAFE_INTEGER) ||
      (a.scenario ?? '').localeCompare(b.scenario ?? '') ||
      Number(a.model !== undefined) - Number(b.model !== undefined) ||
      compareTrialSummaries(a.benchmarkTreatment, b.benchmarkTreatment) ||
      (a.model?.name ?? '').localeCompare(b.model?.name ?? '') ||
      (a.model?.reasoningEffort ?? '').localeCompare(b.model?.reasoningEffort ?? '')
    )
  })
  const rows = ordered.map(comparison => {
    return formatBenchmarkComparison(benchmark, comparison)
  })
  const sections = [
    formatTable(rows, [
      'Benchmark',
      'Capability',
      'Scenario',
      'Model',
      'Reasoning Effort',
      'Control Runs',
      'Runs',
      'Output Tokens',
      'Premium Requests',
      'Session Time',
      'API Time',
    ]),
    `${REPORT_USAGE_NOTE}\nPercent changes compare benchmark totals with control totals; missing baselines are N/A.`,
  ]
  return sections.join('\n\n')
}

export {createBenchmarkReport}
