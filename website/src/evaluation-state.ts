import type {ExperimentTrialOutput} from '@primer/agent-eval'
import {formatChecks, summarizeTrials} from './check-results'

export type TrialError = Pick<Extract<ExperimentTrialOutput, {type: 'error'}>, 'id' | 'scenarioId' | 'error'>

export type IncompleteEvaluation = {
  status: 'incomplete'
  date: string
  errors: Array<TrialError>
}

export function getEvaluationTrials<Trial extends ExperimentTrialOutput>(trials: Iterable<Trial>) {
  const successes: Array<Extract<Trial, {type: 'success'}>> = []
  const errors: Array<TrialError> = []
  for (const trial of trials) {
    if (trial.type === 'error') {
      errors.push({
        id: trial.id,
        scenarioId: trial.scenarioId,
        error: trial.error,
      })
    } else {
      successes.push(trial as Extract<Trial, {type: 'success'}>)
    }
  }
  if (errors.length > 0) {
    return {
      status: 'incomplete' as const,
      errors,
    }
  }
  return {
    status: 'complete' as const,
    trials: successes,
  }
}

export function getRunSummary(trials: Iterable<ExperimentTrialOutput>) {
  const evaluation = getEvaluationTrials(trials)
  if (evaluation.status === 'incomplete') {
    return {
      status: evaluation.status,
      errorCount: evaluation.errors.length,
      checks: null,
    }
  }
  return {
    status: evaluation.status,
    errorCount: 0,
    checks: formatChecks(summarizeTrials(evaluation.trials)),
  }
}
