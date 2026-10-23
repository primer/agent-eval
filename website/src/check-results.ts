import type {ExperimentTrialOutput, TrialSummary} from '@primer/agent-eval'

const {addCheckResults, createTrialSummary, createTrialSummaryComparator, formatCheckSummaries, getCheckDimensions} =
  await import(
    /* turbopackIgnore: true */
    '@primer/agent-eval'
  )

function summarizeTrials(trials: Array<ExperimentTrialOutput>): TrialSummary {
  const summary = createTrialSummary()
  for (const trial of trials) {
    summary.scenarioRuns.set(trial.scenarioId, (summary.scenarioRuns.get(trial.scenarioId) ?? 0) + 1)
    if (trial.type === 'error') {
      summary.errors += 1
      continue
    }
    summary.runs += 1
    addCheckResults(summary.checks, trial.scenarioId, trial.checks)
    for (const session of trial.agent.sessions) {
      summary.outputTokens += session.outputTokens
      summary.premiumRequests += session.premiumRequests
      if (session.aiCredits !== undefined) {
        summary.aiCredits = (summary.aiCredits ?? 0) + session.aiCredits
      }
      summary.sessionDurationMs += session.sessionDurationMs
      summary.totalApiDurationMs += session.totalApiDurationMs
    }
  }
  return summary
}

function formatChecks(summary: TrialSummary, control?: TrialSummary): string {
  const dimensions = getCheckDimensions(control ? [summary, control] : [summary])
  const formatted = formatCheckSummaries(summary, dimensions, control)
  const errors: Array<string> = []
  if (summary.errors > 0) {
    errors.push(`${summary.errors} trial ${summary.errors === 1 ? 'error' : 'errors'}`)
  }
  if (control && control.errors > 0) {
    errors.push(`Control: ${control.errors} trial ${control.errors === 1 ? 'error' : 'errors'}`)
  }
  return String(formatted.Checks ?? 'N/A') + (errors.length > 0 ? ` [${errors.join('; ')}]` : '')
}

function sortTrialGroups<Trial extends ExperimentTrialOutput>(
  groups: Array<Array<Trial>>,
  treatmentId: string,
): Array<Array<Trial>> {
  const entries = groups.map(group => {
    return {
      group,
      summary: summarizeTrials(
        group.filter(trial => {
          return trial.treatmentId === treatmentId
        }),
      ),
    }
  })
  const compare = createTrialSummaryComparator(
    entries.map(entry => {
      return entry.summary
    }),
  )
  return entries
    .toSorted((a, b) => {
      if ((a.summary.runs === 0) !== (b.summary.runs === 0)) {
        return a.summary.runs === 0 ? 1 : -1
      }
      return compare(a.summary, b.summary)
    })
    .map(entry => {
      return entry.group
    })
}

export {formatChecks, sortTrialGroups, summarizeTrials}
