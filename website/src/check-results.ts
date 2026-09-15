import type {ExperimentTrialOutput, TrialSummary} from '@primer/agent-eval'

const {addCheckResults, createTrialSummary, createTrialSummaryComparator, formatCheckSummaries, getCheckDimensions} =
  await import(
    /* turbopackIgnore: true */
    '@primer/agent-eval'
  )

function summarizeTrials(trials: Array<ExperimentTrialOutput>): TrialSummary {
  const summary = createTrialSummary()
  for (const trial of trials) {
    summary.runs += 1
    summary.scenarioRuns.set(trial.scenarioId, (summary.scenarioRuns.get(trial.scenarioId) ?? 0) + 1)
    addCheckResults(summary.checks, trial.scenarioId, trial.checks)
    for (const session of trial.agent.sessions) {
      summary.outputTokens += session.outputTokens
      summary.premiumRequests += session.premiumRequests
      summary.sessionDurationMs += session.sessionDurationMs
      summary.totalApiDurationMs += session.totalApiDurationMs
    }
  }
  return summary
}

function formatChecks(summary: TrialSummary, control?: TrialSummary): string {
  const dimensions = getCheckDimensions(control ? [summary, control] : [summary])
  const formatted = formatCheckSummaries(summary, dimensions, control)
  return String(formatted.Checks ?? 'N/A')
}

function sortTrialGroups(
  groups: Array<Array<ExperimentTrialOutput>>,
  treatmentId: string,
): Array<Array<ExperimentTrialOutput>> {
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
      return compare(a.summary, b.summary)
    })
    .map(entry => {
      return entry.group
    })
}

export {formatChecks, sortTrialGroups, summarizeTrials}
