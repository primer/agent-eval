import type {ExperimentTrialOutput} from '@primer/agent-eval'
import {formatChecks, summarizeTrials} from './check-results'
import type {Run} from './runs'

export type TreatmentResult = {
  id: string
  treatment: string
  model: string
  reasoningEffort: string
  trials: number
  scenarios: number
  checks: string
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

function summarizeTreatments(run: Run, results: Array<ExperimentTrialOutput>): Array<TreatmentResult> {
  const groups = new Map<string, Array<ExperimentTrialOutput>>()

  for (const result of results) {
    const key = JSON.stringify([result.treatmentId, result.model.name, result.model.reasoningEffort])
    const group = groups.get(key)
    if (group) {
      group.push(result)
    } else {
      groups.set(key, [result])
    }
  }

  return Array.from(groups, ([id, trials]) => {
    const first = trials[0]
    const totals = summarizeTrials(trials)

    return {
      id,
      treatment: run.output.treatments.get(first.treatmentId)?.name ?? first.treatmentId,
      model: first.model.name,
      reasoningEffort: first.model.reasoningEffort,
      trials: trials.length,
      scenarios: new Set(
        trials.map(trial => {
          return trial.scenarioId
        }),
      ).size,
      checks: formatChecks(totals),
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

  const scenarios = new Map<string, Array<ExperimentTrialOutput>>()
  for (const scenario of run.output.scenarios.values()) {
    scenarios.set(scenario.id, [])
  }
  for (const result of run.output.trials.values()) {
    const group = scenarios.get(result.scenarioId)
    if (group) {
      group.push(result)
    } else {
      scenarios.set(result.scenarioId, [result])
    }
  }

  return {
    date: run.name,
    treatments: summarizeTreatments(run, [...run.output.trials.values()]),
    scenarios: Array.from(scenarios, ([id, results]) => {
      return {id, treatments: summarizeTreatments(run, results)}
    }).toSorted((first, second) => {
      return first.id.localeCompare(second.id)
    }),
  }
}
