import type {CopilotRunner, ExperimentTrialOutput} from '@primer/agent-eval'
import {formatChecks, summarizeTrials} from './check-results'
import type {Run} from './runs'

export type TreatmentResult = {
  id: string
  treatment: string
  runner: CopilotRunner
  model: string
  reasoningEffort: string
  trials: number
  scenarios: number
  checks: string
  outputTokens: number
  premiumRequests: number
  aiCredits: number | null
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
  capabilities: Array<{
    id: string
    name: string
    treatments: Array<TreatmentResult>
    scenarios: ExperimentResults['scenarios']
  }>
}

function summarizeTreatments(run: Run, results: Array<ExperimentTrialOutput>): Array<TreatmentResult> {
  const groups = new Map<string, Array<ExperimentTrialOutput>>()

  for (const result of results) {
    const key = JSON.stringify([result.treatmentId, result.runner, result.model.name, result.model.reasoningEffort])
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
      runner: first.runner,
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
      aiCredits: totals.aiCredits === null ? null : totals.aiCredits / trials.length,
      sessionDurationMs: totals.sessionDurationMs / trials.length,
      totalApiDurationMs: totals.totalApiDurationMs / trials.length,
    }
  }).toSorted((first, second) => {
    return (
      first.model.localeCompare(second.model) ||
      first.reasoningEffort.localeCompare(second.reasoningEffort) ||
      first.runner.localeCompare(second.runner) ||
      first.treatment.localeCompare(second.treatment) ||
      first.id.localeCompare(second.id)
    )
  })
}

function summarizeScenarios(
  run: Run,
  results: Array<ExperimentTrialOutput>,
  scenarioIds: Iterable<string>,
): ExperimentResults['scenarios'] {
  const scenarios = new Map<string, Array<ExperimentTrialOutput>>()
  for (const id of scenarioIds) {
    scenarios.set(id, [])
  }
  for (const result of results) {
    const group = scenarios.get(result.scenarioId)
    if (group) {
      group.push(result)
    } else {
      scenarios.set(result.scenarioId, [result])
    }
  }

  return Array.from(scenarios, ([id, trials]) => {
    return {id, treatments: summarizeTreatments(run, trials)}
  }).toSorted((first, second) => {
    return first.id.localeCompare(second.id)
  })
}

export function getExperimentResults(run: Run | undefined): ExperimentResults | null {
  if (!run) {
    return null
  }
  const trials = [...run.output.trials.values()]

  return {
    date: run.name,
    treatments: summarizeTreatments(run, trials),
    scenarios: run.output.capabilities.size === 0 ? summarizeScenarios(run, trials, run.output.scenarios.keys()) : [],
    capabilities: [...run.output.capabilities.values()]
      .map(capability => {
        const selected = trials.filter(trial => {
          return trial.capabilityId === capability.id
        })
        return {
          id: capability.id,
          name: capability.name,
          treatments: summarizeTreatments(run, selected),
          scenarios: summarizeScenarios(run, selected, capability.scenarioIds),
        }
      })
      .toSorted((first, second) => {
        return first.name.localeCompare(second.name) || first.id.localeCompare(second.id)
      }),
  }
}
