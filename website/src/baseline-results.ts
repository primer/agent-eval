import type {AgentEvalOutput, AgentEvalOutputResult} from '@primer/agent-eval/output'
import type {BaselineComparison, BaselineResult} from './app/components/Index'
import type {BaselineTrendPoint} from './app/components/BaselineTrends'
import {list as listRuns} from './runs'

type TreatmentResults = {
  control?: AgentEvalOutputResult
  baseline?: AgentEvalOutputResult
}

type MetricValue = {
  raw: string
  change: string | null
}

const percentFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
})

const numberFormatter = new Intl.NumberFormat('en-US')

function getResultKey(scenarioId: string, model: string, reasoningEffort: string | undefined) {
  return JSON.stringify([scenarioId, model, reasoningEffort ?? ''])
}

function getPercentChange(control: number | undefined, baseline: number | undefined): string | null {
  const change = getPercentChangeValue(control, baseline)
  if (change === null) {
    return null
  }

  return `${change > 0 ? '+' : ''}${percentFormatter.format(change)}%`
}

function getPercentChangeValue(control: number | undefined, baseline: number | undefined): number | null {
  if (control === undefined || baseline === undefined || (control === 0 && baseline !== 0)) {
    return null
  }

  if (control === baseline) {
    return 0
  }

  return ((baseline - control) / Math.abs(control)) * 100
}

function getTestPassRate(result: AgentEvalOutputResult | undefined) {
  if (!result) {
    return undefined
  }

  if (result.testResults.numTotalTests === 0) {
    return 0
  }

  return result.testResults.numPassedTests / result.testResults.numTotalTests
}

function countToolCalls(result: AgentEvalOutputResult | undefined) {
  if (!result) {
    return undefined
  }

  return Object.values(result.assistant.tools).reduce((total, count) => total + count, 0)
}

function average(values: Array<number | undefined>) {
  const recorded = values.filter(value => value !== undefined)
  if (recorded.length === 0) {
    return undefined
  }

  return recorded.reduce((total, value) => total + value, 0) / recorded.length
}

function formatMetric(
  control: number | undefined,
  baseline: number | undefined,
  format: (value: number) => string,
): MetricValue {
  return {
    raw: baseline === undefined ? '—' : format(baseline),
    change: getPercentChange(control, baseline),
  }
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${numberFormatter.format(milliseconds)}ms`
  }

  return `${percentFormatter.format(milliseconds / 1000)}s`
}

function getBaselineComparisons(output: AgentEvalOutput): Array<BaselineComparison> {
  const controlTreatment = output.treatments.find(treatment => treatment.config.name === 'Control')
  const baselineTreatment = output.treatments.find(treatment => treatment.config.name === 'Recommended')

  if (!controlTreatment || !baselineTreatment) {
    throw new Error('The latest baseline run must include Control and Recommended treatments')
  }

  const results = new Map<string, TreatmentResults>()
  for (const scenario of output.scenarios) {
    for (const model of output.experiment.models) {
      const reasoningEfforts = model.reasoningEfforts.length > 0 ? model.reasoningEfforts : [undefined]
      for (const reasoningEffort of reasoningEfforts) {
        results.set(getResultKey(scenario.id, model.name, reasoningEffort), {})
      }
    }
  }

  for (const result of output.results) {
    const key = getResultKey(result.scenarioId, result.model, result.reasoningEffort)
    const treatmentResults = results.get(key)
    if (!treatmentResults) {
      throw new Error(`Result "${result.id}" does not match a configured scenario, model, and reasoning effort`)
    }

    if (result.treatmentId === controlTreatment.id) {
      treatmentResults.control = result
    } else if (result.treatmentId === baselineTreatment.id) {
      treatmentResults.baseline = result
    }
  }

  return output.scenarios.map(scenario => {
    const comparisons = Array.from(results, ([key, treatmentResults]) => {
      const [scenarioId, model, reasoningEffort] = JSON.parse(key) as [string, string, string]
      if (scenarioId !== scenario.id) {
        return null
      }

      const {control, baseline} = treatmentResults
      const controlPassRate = getTestPassRate(control)
      const baselinePassRate = getTestPassRate(baseline)

      return {
        id: key,
        model,
        reasoningEffort: reasoningEffort || '—',
        passRate: baselinePassRate,
        turnsValue: baseline?.assistant.turns,
        tests: {
          raw: baseline ? `${baseline.testResults.numPassedTests}/${baseline.testResults.numTotalTests}` : '—',
          change: getPercentChange(controlPassRate, baselinePassRate),
        },
        turns: formatMetric(control?.assistant.turns, baseline?.assistant.turns, value =>
          numberFormatter.format(value),
        ),
        outputTokens: formatMetric(control?.assistant.outputTokens, baseline?.assistant.outputTokens, value =>
          numberFormatter.format(value),
        ),
        premiumRequests: formatMetric(control?.assistant.premiumRequests, baseline?.assistant.premiumRequests, value =>
          numberFormatter.format(value),
        ),
        apiDuration: formatMetric(
          control?.assistant.totalApiDurationMs,
          baseline?.assistant.totalApiDurationMs,
          formatDuration,
        ),
        sessionDuration: formatMetric(
          control?.assistant.sessionDurationMs,
          baseline?.assistant.sessionDurationMs,
          formatDuration,
        ),
        toolCalls: formatMetric(countToolCalls(control), countToolCalls(baseline), value =>
          numberFormatter.format(value),
        ),
      }
    }).filter(comparison => comparison !== null)

    return {
      id: scenario.id,
      scenarioId: scenario.id,
      results: comparisons
        .toSorted((a, b) => {
          if (a.passRate !== b.passRate) {
            return (b.passRate ?? -1) - (a.passRate ?? -1)
          }

          if (a.turnsValue !== b.turnsValue) {
            return (a.turnsValue ?? Number.POSITIVE_INFINITY) - (b.turnsValue ?? Number.POSITIVE_INFINITY)
          }

          return a.model.localeCompare(b.model)
        })
        .map(comparison => ({
          id: comparison.id,
          model: comparison.model,
          reasoningEffort: comparison.reasoningEffort,
          tests: comparison.tests,
          turns: comparison.turns,
          outputTokens: comparison.outputTokens,
          premiumRequests: comparison.premiumRequests,
          apiDuration: comparison.apiDuration,
          sessionDuration: comparison.sessionDuration,
          toolCalls: comparison.toolCalls,
        })),
    }
  })
}

function getAggregateBaselineResults(output: AgentEvalOutput): Array<BaselineResult> {
  const controlTreatment = output.treatments.find(treatment => treatment.config.name === 'Control')
  const baselineTreatment = output.treatments.find(treatment => treatment.config.name === 'Recommended')

  if (!controlTreatment || !baselineTreatment) {
    throw new Error('The latest baseline run must include Control and Recommended treatments')
  }

  const results = output.experiment.models.flatMap(model => {
    const reasoningEfforts = model.reasoningEfforts.length > 0 ? model.reasoningEfforts : [undefined]
    return reasoningEfforts.map(reasoningEffort => {
      const matches = (result: AgentEvalOutputResult) =>
        result.model === model.name && result.reasoningEffort === reasoningEffort
      const controls = output.results.filter(result => result.treatmentId === controlTreatment.id && matches(result))
      const baselines = output.results.filter(result => result.treatmentId === baselineTreatment.id && matches(result))
      const controlPassRate = average(controls.map(getTestPassRate))
      const baselinePassRate = average(baselines.map(getTestPassRate))
      const baselinePassedTests = average(baselines.map(result => result.testResults.numPassedTests))
      const baselineTotalTests = average(baselines.map(result => result.testResults.numTotalTests))
      const controlTurns = average(controls.map(result => result.assistant.turns))
      const baselineTurns = average(baselines.map(result => result.assistant.turns))

      return {
        id: getResultKey('aggregate', model.name, reasoningEffort),
        model: model.name,
        reasoningEffort: reasoningEffort ?? '—',
        passRate: baselinePassRate,
        turnsValue: baselineTurns,
        tests: {
          raw:
            baselinePassedTests === undefined || baselineTotalTests === undefined
              ? '—'
              : `${numberFormatter.format(baselinePassedTests)}/${numberFormatter.format(baselineTotalTests)}`,
          change: getPercentChange(controlPassRate, baselinePassRate),
        },
        turns: formatMetric(controlTurns, baselineTurns, value => numberFormatter.format(value)),
        outputTokens: formatMetric(
          average(controls.map(result => result.assistant.outputTokens)),
          average(baselines.map(result => result.assistant.outputTokens)),
          value => numberFormatter.format(value),
        ),
        premiumRequests: formatMetric(
          average(controls.map(result => result.assistant.premiumRequests)),
          average(baselines.map(result => result.assistant.premiumRequests)),
          value => numberFormatter.format(value),
        ),
        apiDuration: formatMetric(
          average(controls.map(result => result.assistant.totalApiDurationMs)),
          average(baselines.map(result => result.assistant.totalApiDurationMs)),
          formatDuration,
        ),
        sessionDuration: formatMetric(
          average(controls.map(result => result.assistant.sessionDurationMs)),
          average(baselines.map(result => result.assistant.sessionDurationMs)),
          formatDuration,
        ),
        toolCalls: formatMetric(average(controls.map(countToolCalls)), average(baselines.map(countToolCalls)), value =>
          numberFormatter.format(value),
        ),
      }
    })
  })

  return results
    .toSorted((a, b) => {
      if (a.passRate !== b.passRate) {
        return (b.passRate ?? -1) - (a.passRate ?? -1)
      }

      if (a.turnsValue !== b.turnsValue) {
        return (a.turnsValue ?? Number.POSITIVE_INFINITY) - (b.turnsValue ?? Number.POSITIVE_INFINITY)
      }

      return a.model.localeCompare(b.model)
    })
    .map(result => ({
      id: result.id,
      model: result.model,
      reasoningEffort: result.reasoningEffort,
      tests: result.tests,
      turns: result.turns,
      outputTokens: result.outputTokens,
      premiumRequests: result.premiumRequests,
      apiDuration: result.apiDuration,
      sessionDuration: result.sessionDuration,
      toolCalls: result.toolCalls,
    }))
}

function getBaselineTrendPoints(date: string, output: AgentEvalOutput): Array<BaselineTrendPoint> {
  const controlTreatment = output.treatments.find(treatment => treatment.config.name === 'Control')
  const baselineTreatment = output.treatments.find(treatment => treatment.config.name === 'Recommended')
  if (!controlTreatment || !baselineTreatment) {
    return []
  }

  const controls = new Map(
    output.results
      .filter(result => result.treatmentId === controlTreatment.id)
      .map(result => [getResultKey(result.scenarioId, result.model, result.reasoningEffort), result]),
  )

  return output.results
    .filter(result => result.treatmentId === baselineTreatment.id)
    .map(result => {
      const control = controls.get(getResultKey(result.scenarioId, result.model, result.reasoningEffort))
      const controlPassRate = getTestPassRate(control)
      const baselinePassRate = getTestPassRate(result)
      const controlToolCalls = countToolCalls(control)
      const baselineToolCalls = countToolCalls(result)
      const metric = (value: number, controlValue: number | undefined, raw = numberFormatter.format(value)) => ({
        value,
        raw,
        change: getPercentChangeValue(controlValue, value),
      })

      return {
        id: `${date}:${result.id}`,
        date,
        scenarioId: result.scenarioId,
        model: result.model,
        reasoningEffort: result.reasoningEffort ?? '—',
        metrics: {
          tests: {
            value: result.testResults.numPassedTests,
            raw: `${result.testResults.numPassedTests}/${result.testResults.numTotalTests}`,
            change: getPercentChangeValue(controlPassRate, baselinePassRate),
          },
          turns: metric(result.assistant.turns, control?.assistant.turns),
          outputTokens: metric(result.assistant.outputTokens, control?.assistant.outputTokens),
          premiumRequests: metric(result.assistant.premiumRequests, control?.assistant.premiumRequests),
          apiDuration: metric(
            result.assistant.totalApiDurationMs / 1000,
            control ? control.assistant.totalApiDurationMs / 1000 : undefined,
            formatDuration(result.assistant.totalApiDurationMs),
          ),
          sessionDuration: metric(
            result.assistant.sessionDurationMs / 1000,
            control ? control.assistant.sessionDurationMs / 1000 : undefined,
            formatDuration(result.assistant.sessionDurationMs),
          ),
          toolCalls: metric(baselineToolCalls ?? 0, controlToolCalls),
        },
      }
    })
}

function getAggregateTrendPoints(date: string, output: AgentEvalOutput): Array<BaselineTrendPoint> {
  const controlTreatment = output.treatments.find(treatment => treatment.config.name === 'Control')
  const baselineTreatment = output.treatments.find(treatment => treatment.config.name === 'Recommended')
  if (!controlTreatment || !baselineTreatment) {
    return []
  }

  return output.experiment.models.flatMap(model => {
    const reasoningEfforts = model.reasoningEfforts.length > 0 ? model.reasoningEfforts : [undefined]
    return reasoningEfforts.map(reasoningEffort => {
      const matches = (result: AgentEvalOutputResult) =>
        result.model === model.name && result.reasoningEffort === reasoningEffort
      const controls = output.results.filter(result => result.treatmentId === controlTreatment.id && matches(result))
      const baselines = output.results.filter(result => result.treatmentId === baselineTreatment.id && matches(result))
      const metric = (
        baselineValue: number | undefined,
        controlValue: number | undefined,
        raw = baselineValue === undefined ? '—' : numberFormatter.format(baselineValue),
      ) => ({
        value: baselineValue ?? 0,
        raw,
        change: getPercentChangeValue(controlValue, baselineValue),
      })
      const baselinePassedTests = average(baselines.map(result => result.testResults.numPassedTests))
      const baselineTotalTests = average(baselines.map(result => result.testResults.numTotalTests))
      const controlPassRate = average(controls.map(getTestPassRate))
      const baselinePassRate = average(baselines.map(getTestPassRate))

      return {
        id: `${date}:aggregate:${model.name}:${reasoningEffort ?? ''}`,
        date,
        scenarioId: 'aggregate',
        model: model.name,
        reasoningEffort: reasoningEffort ?? '—',
        metrics: {
          tests: {
            value: baselinePassedTests ?? 0,
            raw:
              baselinePassedTests === undefined || baselineTotalTests === undefined
                ? '—'
                : `${numberFormatter.format(baselinePassedTests)}/${numberFormatter.format(baselineTotalTests)}`,
            change: getPercentChangeValue(controlPassRate, baselinePassRate),
          },
          turns: metric(
            average(baselines.map(result => result.assistant.turns)),
            average(controls.map(result => result.assistant.turns)),
          ),
          outputTokens: metric(
            average(baselines.map(result => result.assistant.outputTokens)),
            average(controls.map(result => result.assistant.outputTokens)),
          ),
          premiumRequests: metric(
            average(baselines.map(result => result.assistant.premiumRequests)),
            average(controls.map(result => result.assistant.premiumRequests)),
          ),
          apiDuration: (() => {
            const baselineValue = average(baselines.map(result => result.assistant.totalApiDurationMs))
            const controlValue = average(controls.map(result => result.assistant.totalApiDurationMs))
            return metric(
              baselineValue === undefined ? undefined : baselineValue / 1000,
              controlValue === undefined ? undefined : controlValue / 1000,
              baselineValue === undefined ? '—' : formatDuration(baselineValue),
            )
          })(),
          sessionDuration: (() => {
            const baselineValue = average(baselines.map(result => result.assistant.sessionDurationMs))
            const controlValue = average(controls.map(result => result.assistant.sessionDurationMs))
            return metric(
              baselineValue === undefined ? undefined : baselineValue / 1000,
              controlValue === undefined ? undefined : controlValue / 1000,
              baselineValue === undefined ? '—' : formatDuration(baselineValue),
            )
          })(),
          toolCalls: metric(average(baselines.map(countToolCalls)), average(controls.map(countToolCalls))),
        },
      }
    })
  })
}

async function getBaselinePageData() {
  const runs = await listRuns()
  const baselineRuns = runs.filter(run => run.output.experiment.id === 'baseline')
  const latestRun = baselineRuns[0]
  const baseline = latestRun ? getBaselineComparisons(latestRun.output) : null
  const baselineTrends = baselineRuns.flatMap(run => getBaselineTrendPoints(run.name, run.output))
  const aggregateResults = latestRun ? getAggregateBaselineResults(latestRun.output) : []
  const aggregateTrends = baselineRuns.flatMap(run => getAggregateTrendPoints(run.name, run.output))

  return {aggregateResults, aggregateTrends, baseline, baselineTrends}
}

export {getBaselinePageData}
