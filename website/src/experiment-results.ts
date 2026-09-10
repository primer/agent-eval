import type {Run, RunOutputResult} from './runs'

export type TreatmentResult = {
  id: string
  treatment: string
  model: string
  reasoningEffort: string
  trials: number
  scenarios: number
  passedTests: number
  totalTests: number
  passRate: number | null
  outputTokens: number
  premiumRequests: number
  sessionDurationMs: number
  totalApiDurationMs: number
}

export type ExperimentResults = {
  date: string
  treatments: Array<TreatmentResult>
  scenarios: Array<{
    id: string
    treatments: Array<TreatmentResult>
  }>
}

function summarizeTreatments(run: Run, results: Array<RunOutputResult>): Array<TreatmentResult> {
  const groups = new Map<string, Array<RunOutputResult>>()
  const treatments = new Map(
    run.output.treatments.map(treatment => {
      return [treatment.id, treatment.config.name]
    }),
  )

  for (const result of results) {
    const key = JSON.stringify([result.treatmentId, result.model, result.reasoningEffort ?? null])
    const group = groups.get(key)
    if (group) {
      group.push(result)
    } else {
      groups.set(key, [result])
    }
  }

  return Array.from(groups, ([id, trials]) => {
    const first = trials[0]
    const totals = trials.reduce(
      (total, trial) => {
        total.passedTests += trial.testResults.numPassedTests
        total.totalTests += trial.testResults.numTotalTests
        total.outputTokens += trial.assistant.outputTokens
        total.premiumRequests += trial.assistant.premiumRequests
        total.sessionDurationMs += trial.assistant.sessionDurationMs
        total.totalApiDurationMs += trial.assistant.totalApiDurationMs
        return total
      },
      {passedTests: 0, totalTests: 0, outputTokens: 0, premiumRequests: 0, sessionDurationMs: 0, totalApiDurationMs: 0},
    )

    return {
      id,
      treatment: treatments.get(first.treatmentId) ?? first.treatmentId,
      model: first.model,
      reasoningEffort: first.reasoningEffort ?? 'Default',
      trials: trials.length,
      scenarios: new Set(
        trials.map(trial => {
          return trial.scenarioId
        }),
      ).size,
      passedTests: totals.passedTests,
      totalTests: totals.totalTests,
      passRate: totals.totalTests === 0 ? null : totals.passedTests / totals.totalTests,
      outputTokens: totals.outputTokens / trials.length,
      premiumRequests: totals.premiumRequests / trials.length,
      sessionDurationMs: totals.sessionDurationMs / trials.length,
      totalApiDurationMs: totals.totalApiDurationMs / trials.length,
    }
  }).toSorted((first, second) => {
    return (
      first.model.localeCompare(second.model) ||
      first.reasoningEffort.localeCompare(second.reasoningEffort) ||
      first.treatment.localeCompare(second.treatment) ||
      first.id.localeCompare(second.id)
    )
  })
}

export function getExperimentResults(run: Run | undefined): ExperimentResults | null {
  if (!run) {
    return null
  }

  const scenarios = new Map<string, Array<RunOutputResult>>()
  for (const scenario of run.output.scenarios) {
    scenarios.set(scenario.id, [])
  }
  for (const result of run.output.results) {
    const group = scenarios.get(result.scenarioId)
    if (group) {
      group.push(result)
    } else {
      scenarios.set(result.scenarioId, [result])
    }
  }

  return {
    date: run.name,
    treatments: summarizeTreatments(run, run.output.results),
    scenarios: Array.from(scenarios, ([id, results]) => {
      return {id, treatments: summarizeTreatments(run, results)}
    }).toSorted((first, second) => {
      return first.id.localeCompare(second.id)
    }),
  }
}
