import type {ModelVariant} from '../model'
import type {CopilotRunner} from '../copilot-runner'
import type {RunPlanResult} from '../plan'
import {
  formatCredits,
  formatDuration,
  formatNumber,
  formatPercentDelta,
  formatTable,
  type TableRow,
} from '../report/format'
import {formatCheckSummaries, getCheckDimensions, type CheckDimension} from '../report/checks'
import {ControlTreatment, getTreatmentId} from '../treatment'
import {
  REPORT_CHECKS_NOTE,
  REPORT_USAGE_NOTE,
  addTrialResultToSummary,
  createTrialSummaryComparator,
  createTrialSummary,
  type TrialSummary,
} from '../trial/report'
import type {Benchmark, Capability} from './benchmark'
import type {BenchmarkTrial} from './plan'

type BenchmarkComparison = {
  capability: Capability
  runner: CopilotRunner
  scenario?: string
  model?: ModelVariant
  control: TrialSummary
  benchmarkTreatment: TrialSummary
}

type CreateBenchmarkReportOptions = {
  benchmark: Benchmark
  runPlanResult: RunPlanResult<BenchmarkTrial>
}

type UsageMetric = 'outputTokens' | 'premiumRequests' | 'aiCredits' | 'sessionDurationMs' | 'totalApiDurationMs'

function formatBenchmarkValue(
  comparison: BenchmarkComparison,
  metric: UsageMetric,
  format: (value: number) => string,
): string {
  const treatment = comparison.benchmarkTreatment.runs === 0 ? null : comparison.benchmarkTreatment[metric]
  if (treatment === null) {
    return 'N/A'
  }

  const control = comparison.control.runs === 0 ? null : comparison.control[metric]
  const delta = control === null ? 'N/A' : formatPercentDelta(control, treatment)
  return `${format(treatment)} (${delta})`
}

function formatBenchmarkComparison(
  benchmark: Benchmark,
  comparison: BenchmarkComparison,
  dimensions: Array<CheckDimension>,
  showRunner: boolean,
): TableRow {
  return {
    Benchmark: comparison.scenario ? '' : benchmark.name,
    Capability: comparison.scenario ? '' : comparison.capability.name,
    ...(showRunner ? {Runner: comparison.scenario ? '' : comparison.runner} : {}),
    Scenario: comparison.model ? '' : comparison.scenario ? `  ${comparison.scenario}` : 'All scenarios',
    Model: comparison.model ? `    ${comparison.model.name}` : 'All models',
    'Reasoning Effort': comparison.model?.reasoningEffort ?? '',
    'Control Runs': comparison.control.runs,
    Runs: comparison.benchmarkTreatment.runs,
    ...formatCheckSummaries(comparison.benchmarkTreatment, dimensions, comparison.control),
    'Output Tokens': formatBenchmarkValue(comparison, 'outputTokens', formatNumber),
    'Premium Requests': formatBenchmarkValue(comparison, 'premiumRequests', formatNumber),
    'AI Credits': formatBenchmarkValue(comparison, 'aiCredits', formatCredits),
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
  const showRunner = runPlanResult.results.some(({trial}) => {
    return trial.runner === 'copilot-sdk'
  })

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
      const runner = trial.runner ?? 'copilot-cli'
      const key = JSON.stringify([
        trial.capability.id,
        runner,
        value.scenario,
        value.model?.name,
        value.model?.reasoningEffort,
      ])
      const comparison = comparisons.get(key) ?? {
        capability: trial.capability,
        runner,
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
  const dimensions = getCheckDimensions(
    [...comparisons.values()].flatMap(comparison => {
      return [comparison.control, comparison.benchmarkTreatment]
    }),
  )
  const modelGroups = new Map<string, Array<TrialSummary>>()
  for (const comparison of comparisons.values()) {
    if (comparison.model) {
      const key = JSON.stringify([comparison.capability.id, comparison.runner, comparison.scenario])
      const summaries = modelGroups.get(key) ?? []
      summaries.push(comparison.benchmarkTreatment)
      modelGroups.set(key, summaries)
    }
  }
  const modelComparators = new Map(
    [...modelGroups].map(([key, summaries]) => {
      return [key, createTrialSummaryComparator(summaries)]
    }),
  )
  const ordered = [...comparisons.values()].toSorted((a, b) => {
    const compareModels = modelComparators.get(JSON.stringify([a.capability.id, a.runner, a.scenario]))
    return (
      (capabilityOrder.get(a.capability.id) ?? Number.MAX_SAFE_INTEGER) -
        (capabilityOrder.get(b.capability.id) ?? Number.MAX_SAFE_INTEGER) ||
      a.capability.name.localeCompare(b.capability.name) ||
      a.runner.localeCompare(b.runner) ||
      Number(a.scenario !== undefined) - Number(b.scenario !== undefined) ||
      (scenarioOrder.get(a.capability.id)?.get(a.scenario ?? '') ?? Number.MAX_SAFE_INTEGER) -
        (scenarioOrder.get(b.capability.id)?.get(b.scenario ?? '') ?? Number.MAX_SAFE_INTEGER) ||
      (a.scenario ?? '').localeCompare(b.scenario ?? '') ||
      Number(a.model !== undefined) - Number(b.model !== undefined) ||
      (a.model && b.model && compareModels ? compareModels(a.benchmarkTreatment, b.benchmarkTreatment) : 0) ||
      (a.model?.name ?? '').localeCompare(b.model?.name ?? '') ||
      (a.model?.reasoningEffort ?? '').localeCompare(b.model?.reasoningEffort ?? '')
    )
  })
  const rows = ordered.map(comparison => {
    return formatBenchmarkComparison(benchmark, comparison, dimensions, showRunner)
  })
  const sections = [
    formatTable(rows, [
      'Benchmark',
      'Capability',
      ...(showRunner ? ['Runner'] : []),
      'Scenario',
      'Model',
      'Reasoning Effort',
      'Control Runs',
      'Runs',
      ...(dimensions.length > 0 ? ['Checks'] : []),
      'Output Tokens',
      'Premium Requests',
      'AI Credits',
      'Session Time',
      'API Time',
    ]),
    ...(dimensions.length > 0 ? [REPORT_CHECKS_NOTE] : []),
    `${REPORT_USAGE_NOTE}\n${
      dimensions.length > 0
        ? 'Percent changes compare check averages and usage totals with control; missing baselines are N/A.'
        : 'Percent changes compare benchmark totals with control totals; missing baselines are N/A.'
    }`,
  ]
  return sections.join('\n\n')
}

export {createBenchmarkReport}
