import type {CopilotRunner, ExperimentTrialOutput, TrialSummary} from '@primer/agent-eval'
import {summarizeTrials} from './check-results'
import type {Run} from './runs'

const {formatCheckSummaries, getCheckDimensions, getCheckValue} = await import(
  /* turbopackIgnore: true */
  '@primer/agent-eval'
)

type Metric = {
  id: string
  label: string
}

type MetricValue = {
  value: number | null
  raw: string
  comparisons: Record<string, string>
}

type Variant = {
  id: string
  model: string
  reasoningEffort: string
  runner: CopilotRunner
}

type TreatmentMetrics = {
  treatmentId: string
  variantId: string
  trials: number
  scenarios: number
  metrics: Record<string, MetricValue>
}

type ScenarioComparison = {
  id: string
  treatments: Array<TreatmentMetrics>
}

type BenchmarkExperimentResults = {
  id: string
  name: string
  variants: Array<Variant>
  treatments: Array<{id: string; name: string}>
  metrics: Array<Metric>
  capabilities: Array<{
    id: string
    name: string
    treatments: Array<TreatmentMetrics>
    scenarios: Array<ScenarioComparison>
  }>
}

const usageMetrics = [
  {id: 'outputTokens', label: 'Output tokens'},
  {id: 'premiumRequests', label: 'Premium requests'},
  {id: 'aiCredits', label: 'AI credits'},
  {id: 'sessionDurationMs', label: 'Session time'},
  {id: 'totalApiDurationMs', label: 'API time'},
] as const

function getVariant(trial: ExperimentTrialOutput): Variant {
  const runner = trial.runner ?? 'copilot-cli'
  return {
    id: JSON.stringify([trial.model.name, trial.model.reasoningEffort, runner]),
    model: trial.model.name,
    reasoningEffort: trial.model.reasoningEffort,
    runner,
  }
}

function percentChange(value: number | null, reference: number | null): string {
  if (value === null || reference === null || (reference === 0 && value !== 0)) {
    return 'N/A'
  }
  const change = reference === 0 ? 0 : ((value - reference) / reference) * 100
  return change === 0 ? '0%' : `${change > 0 ? '+' : ''}${change.toFixed(1)}%`
}

function formatUsage(id: string, value: number | null): string {
  if (value === null) {
    return 'N/A'
  }
  if (id === 'sessionDurationMs' || id === 'totalApiDurationMs') {
    return `${(value / 1000).toLocaleString('en-US', {maximumFractionDigits: 1})} s`
  }
  return value.toLocaleString('en-US', {maximumFractionDigits: id === 'aiCredits' ? 3 : 1})
}

function getBenchmarkExperimentResults(run: Run): BenchmarkExperimentResults {
  const benchmark = run.output.benchmark
  if (!benchmark) {
    throw new Error('Expected a benchmark-backed experiment')
  }
  const trials = [...run.output.trials.values()]
  const variants = [
    ...new Map(
      trials.map(trial => {
        const variant = getVariant(trial)
        return [variant.id, variant]
      }),
    ).values(),
  ].toSorted((a, b) => {
    return a.id.localeCompare(b.id)
  })
  const treatments = [...run.output.treatments.values()].toSorted((a, b) => {
    const order = ['Control', 'Benchmark']
    const rank = (name: string) => {
      const index = order.indexOf(name)
      return index === -1 ? order.length : index
    }
    return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name)
  })
  const references = treatments.filter(treatment => {
    return treatment.name === 'Control' || treatment.name === 'Benchmark'
  })
  const dimensions = getCheckDimensions([summarizeTrials(trials)])
  const checkGroups = new Map<string, typeof dimensions>()
  for (const dimension of dimensions) {
    const id = JSON.stringify(['checks', dimension.type, dimension.unit ?? null, dimension.direction ?? null])
    const group = checkGroups.get(id) ?? []
    group.push(dimension)
    checkGroups.set(id, group)
  }
  const metrics: Array<Metric> = [
    ...[...checkGroups].map(([id, group]) => {
      const {type, unit, direction} = group[0]
      return {
        id,
        label:
          type === 'outcomes'
            ? 'Checks (pass %)'
            : `Measurements (${unit ?? 'unitless'}, ${direction ?? 'no direction'})`,
      }
    }),
    ...usageMetrics,
  ]

  function summarize(results: Array<ExperimentTrialOutput>): Array<TreatmentMetrics> {
    return variants.flatMap(variant => {
      const summaries = new Map(
        treatments.map(treatment => {
          const selected = results.filter(trial => {
            return trial.treatmentId === treatment.id && getVariant(trial).id === variant.id
          })
          return [treatment.id, summarizeTrials(selected)]
        }),
      )
      return treatments.flatMap(treatment => {
        const summary = summaries.get(treatment.id)!
        if (summary.runs === 0) {
          return []
        }
        const values: Record<string, MetricValue> = {}
        for (const [id, group] of checkGroups) {
          const checks = group.flatMap(({key}) => {
            const check = summary.checks.get(key)
            return check ? [check] : []
          })
          const rollup =
            checks.length === 0
              ? undefined
              : {
                  ...checks[0],
                  sum: checks.reduce((sum, check) => {
                    return sum + check.sum
                  }, 0),
                  count: checks.reduce((count, check) => {
                    return count + check.count
                  }, 0),
                }
          values[id] = {
            value: getCheckValue(rollup),
            raw: String(formatCheckSummaries(summary, group).Checks ?? 'N/A'),
            comparisons: Object.fromEntries(
              references.map(reference => {
                const baseline = summaries.get(reference.id)!
                return [reference.id, String(formatCheckSummaries(summary, group, baseline).Checks ?? 'N/A')]
              }),
            ),
          }
        }
        for (const metric of usageMetrics) {
          const mean = (source: TrialSummary) => {
            const value = source[metric.id]
            return source.runs === 0 || value === null ? null : value / source.runs
          }
          const value = mean(summary)
          const raw = formatUsage(metric.id, value)
          values[metric.id] = {
            value,
            raw,
            comparisons: Object.fromEntries(
              references.map(reference => {
                return [reference.id, `${raw} (${percentChange(value, mean(summaries.get(reference.id)!))})`]
              }),
            ),
          }
        }
        return [
          {
            treatmentId: treatment.id,
            variantId: variant.id,
            trials: summary.runs,
            scenarios: summary.scenarioRuns.size,
            metrics: values,
          },
        ]
      })
    })
  }

  return {
    id: benchmark.id,
    name: benchmark.name,
    variants,
    treatments,
    metrics,
    capabilities: Object.values(benchmark.capabilities)
      .toSorted((a, b) => {
        return a.name.localeCompare(b.name)
      })
      .map(capability => {
        const selected = trials.filter(trial => {
          return trial.capabilityId === capability.id
        })
        return {
          id: capability.id,
          name: capability.name,
          treatments: summarize(selected),
          scenarios: capability.scenarioIds.map(id => {
            return {
              id,
              treatments: summarize(
                selected.filter(trial => {
                  return trial.scenarioId === id
                }),
              ),
            }
          }),
        }
      }),
  }
}

export {getBenchmarkExperimentResults}
export type {BenchmarkExperimentResults, TreatmentMetrics}
