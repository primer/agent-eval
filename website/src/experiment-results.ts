import type {RunOutput, RunOutputResult} from './runs'

// Experiment plans reserve ControlTreatment.name as the control's treatment ID.
const CONTROL_TREATMENT_ID = 'Control'

export type ResourceMetric =
  | 'turns'
  | 'outputTokens'
  | 'premiumRequests'
  | 'sessionDurationMs'
  | 'totalApiDurationMs'

const resourceMetrics: Array<ResourceMetric> = [
  'turns',
  'outputTokens',
  'premiumRequests',
  'sessionDurationMs',
  'totalApiDurationMs',
]

export type ExperimentResultSummary = {
  id: string
  treatmentId: string
  treatment: string
  model: string
  reasoningEffort: string | null
  trialCount: number
  scenarioCount: number
  passedTests: number
  totalTests: number
  passRate: number | null
  means: Record<ResourceMetric, number | null>
  comparison: 'control' | 'matched' | 'missing-control' | 'unbalanced' | 'no-trials'
  passRateDelta: number | null
  resourceDeltas: Record<ResourceMetric, number | null>
}

export type ExperimentOverviewData = {
  results: Array<ExperimentResultSummary>
  scenarios: Array<{id: string; results: Array<ExperimentResultSummary>}>
}

function emptyMetrics(): Record<ResourceMetric, null> {
  return {turns: null, outputTokens: null, premiumRequests: null, sessionDurationMs: null, totalApiDurationMs: null}
}

function variantKey(model: string, effort: string | null | undefined): string {
  return JSON.stringify([model, effort ?? null])
}

function coverage(results: Array<RunOutputResult>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const result of results) {
    counts.set(result.scenarioId, (counts.get(result.scenarioId) ?? 0) + 1)
  }
  return counts
}

function summarize(output: RunOutput, trials: Array<RunOutputResult>): Array<ExperimentResultSummary> {
  const variants = new Map<string, {model: string; reasoningEffort: string | null}>()
  for (const model of output.experiment.models) {
    for (const effort of model.reasoningEfforts) {
      variants.set(variantKey(model.name, effort), {model: model.name, reasoningEffort: effort ?? null})
    }
  }
  const treatments = new Map(output.treatments.map(treatment => [treatment.id, treatment.config.name]))
  const grouped = new Map<string, Array<RunOutputResult>>()
  for (const result of output.results) {
    variants.set(variantKey(result.model, result.reasoningEffort), {
      model: result.model,
      reasoningEffort: result.reasoningEffort ?? null,
    })
    if (!treatments.has(result.treatmentId)) {
      treatments.set(result.treatmentId, result.treatmentId)
    }
  }
  for (const trial of trials) {
    const key = JSON.stringify([variantKey(trial.model, trial.reasoningEffort), trial.treatmentId])
    const group = grouped.get(key) ?? []
    group.push(trial)
    grouped.set(key, group)
  }

  return [...variants.entries()]
    .toSorted(([first], [second]) => first.localeCompare(second))
    .flatMap(([variant, model]) => {
      const summaries = [...treatments.entries()]
        .toSorted(([first], [second]) => {
          if (first === CONTROL_TREATMENT_ID) return -1
          if (second === CONTROL_TREATMENT_ID) return 1
          return first.localeCompare(second)
        })
        .map(([treatmentId, treatment]): ExperimentResultSummary => {
          const id = JSON.stringify([variant, treatmentId])
          const results = grouped.get(id) ?? []
          const passedTests = results.reduce((total, result) => total + result.testResults.numPassedTests, 0)
          const totalTests = results.reduce((total, result) => total + result.testResults.numTotalTests, 0)
          const means: ExperimentResultSummary['means'] = emptyMetrics()
          for (const metric of resourceMetrics) {
            means[metric] =
              results.length > 0
                ? results.reduce((total, result) => total + result.assistant[metric], 0) / results.length
                : null
          }
          return {
            id,
            treatmentId,
            treatment,
            ...model,
            trialCount: results.length,
            scenarioCount: coverage(results).size,
            passedTests,
            totalTests,
            passRate: totalTests > 0 ? (passedTests / totalTests) * 100 : null,
            means,
            comparison: treatmentId === CONTROL_TREATMENT_ID ? 'control' : 'missing-control',
            passRateDelta: null,
            resourceDeltas: emptyMetrics(),
          }
        })
      const control = summaries.find(summary => summary.treatmentId === CONTROL_TREATMENT_ID)
      const controlCoverage = coverage(grouped.get(control?.id ?? '') ?? [])
      for (const summary of summaries) {
        if (summary.trialCount === 0) {
          summary.comparison = 'no-trials'
          continue
        }
        if (summary.comparison === 'control' || !control?.trialCount) continue
        const treatmentCoverage = coverage(grouped.get(summary.id) ?? [])
        if (
          treatmentCoverage.size !== controlCoverage.size ||
          [...treatmentCoverage].some(([scenarioId, count]) => controlCoverage.get(scenarioId) !== count)
        ) {
          summary.comparison = 'unbalanced'
          continue
        }
        summary.comparison = 'matched'
        if (summary.passRate !== null && control.passRate !== null) {
          summary.passRateDelta = summary.passRate - control.passRate
        }
        for (const metric of resourceMetrics) {
          const baseline = control.means[metric]
          const value = summary.means[metric]
          if (baseline !== null && baseline !== 0 && value !== null) {
            summary.resourceDeltas[metric] = ((value - baseline) / baseline) * 100
          }
        }
      }
      return summaries
    })
}

export function createExperimentOverview(output: RunOutput): ExperimentOverviewData {
  const scenarioIds = new Set([...output.scenarios.map(scenario => scenario.id), ...output.results.map(r => r.scenarioId)])
  return {
    results: summarize(output, output.results),
    scenarios: [...scenarioIds].toSorted().map(id => ({
      id,
      results: summarize(
        output,
        output.results.filter(result => result.scenarioId === id),
      ),
    })),
  }
}
