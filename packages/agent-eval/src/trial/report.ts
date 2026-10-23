import type {RunTrialResult} from './run'
import type {Trial} from './trial'
import {formatCredits, formatDuration, formatNumber, type TableRow} from '../report/format'
import {
  addCheckResults,
  formatCheckSummaries,
  getCheckDimensions,
  getCheckValue,
  type CheckDimension,
  type CheckSummary,
} from '../report/checks'

type TrialSummary = {
  runs: number
  errors: number
  checks: Map<string, CheckSummary>
  scenarioRuns: Map<string, number>
  outputTokens: number
  premiumRequests: number
  aiCredits: number | null
  sessionDurationMs: number
  totalApiDurationMs: number
}

const TRIAL_SUMMARY_COLUMNS = [
  'Runs',
  'Errors',
  'Output Tokens',
  'Premium Requests',
  'AI Credits',
  'Session Time',
  'API Time',
]

const REPORT_USAGE_NOTE =
  'Runs count completed trials only. Usage totals include completed implementation-agent sessions only (judge sessions and failed trials excluded).'

const REPORT_CHECKS_NOTE =
  'Checks average per-check, per-trial pass percentages or measurement means, keeping different units and directions separate. ' +
  'Skipped outcomes and errors are excluded from values and shown separately. ' +
  'Groups without trial errors sort first. Ordering then uses equal-weight ranks across shared checks with values for every run and no errors; measurements without a direction are not ranked. Usage breaks ties.'

function createTrialSummary(): TrialSummary {
  return {
    runs: 0,
    errors: 0,
    checks: new Map(),
    scenarioRuns: new Map(),
    outputTokens: 0,
    premiumRequests: 0,
    aiCredits: null,
    sessionDurationMs: 0,
    totalApiDurationMs: 0,
  }
}

function addTrialResultToSummary(summary: TrialSummary, trial: Trial, result: RunTrialResult): void {
  const scenarioId = trial.scenario.id
  summary.scenarioRuns.set(scenarioId, (summary.scenarioRuns.get(scenarioId) ?? 0) + 1)
  if (result.type === 'error') {
    summary.errors += 1
    return
  }

  summary.runs += 1
  addCheckResults(summary.checks, scenarioId, result.checks)

  for (const session of result.agent.sessions) {
    summary.outputTokens += session.outputTokens
    summary.premiumRequests += session.premiumRequests
    if (session.aiCredits !== undefined) {
      summary.aiCredits = (summary.aiCredits ?? 0) + session.aiCredits
    }
    summary.sessionDurationMs += session.sessionDurationMs
    summary.totalApiDurationMs += session.totalApiDurationMs
  }
}

function compareTrialSummaries(a: TrialSummary, b: TrialSummary): number {
  return (
    Number(a.runs === 0) - Number(b.runs === 0) ||
    a.outputTokens - b.outputTokens ||
    a.sessionDurationMs - b.sessionDurationMs ||
    a.premiumRequests - b.premiumRequests ||
    a.totalApiDurationMs - b.totalApiDurationMs
  )
}

function createTrialSummaryComparator(summaries: Array<TrialSummary>): (a: TrialSummary, b: TrialSummary) => number {
  const ranks = new Map<TrialSummary, number>()

  for (const {key} of getCheckDimensions(summaries)) {
    const values = summaries.flatMap(summary => {
      const check = summary.checks.get(key)
      const value = getCheckValue(check)
      if (
        !check ||
        value === null ||
        !check.direction ||
        check.errors > 0 ||
        check.count !== summary.scenarioRuns.get(check.scenarioId)
      ) {
        return []
      }
      return [{summary, value: check.direction === 'lower-is-better' ? value : -value}]
    })
    if (values.length !== summaries.length) {
      continue
    }

    const ordered = values.toSorted((a, b) => {
      return a.value - b.value
    })
    for (let start = 0; start < ordered.length;) {
      let end = start + 1
      while (end < ordered.length && ordered[end].value === ordered[start].value) {
        end += 1
      }
      const rank = (start + end - 1) / 2
      for (let index = start; index < end; index += 1) {
        const {summary} = ordered[index]
        ranks.set(summary, (ranks.get(summary) ?? 0) + rank)
      }
      start = end
    }
  }

  return (a, b) => {
    return (
      Number(a.errors > 0) - Number(b.errors > 0) ||
      (ranks.get(a) ?? 0) - (ranks.get(b) ?? 0) ||
      compareTrialSummaries(a, b)
    )
  }
}

function formatTrialSummary(summary: TrialSummary, dimensions: Array<CheckDimension> = []): TableRow {
  return {
    Runs: summary.runs,
    Errors: summary.errors,
    ...formatCheckSummaries(summary, dimensions),
    'Output Tokens': summary.runs === 0 ? 'N/A' : formatNumber(summary.outputTokens),
    'Premium Requests': summary.runs === 0 ? 'N/A' : formatNumber(summary.premiumRequests),
    'AI Credits': summary.aiCredits === null ? 'N/A' : formatCredits(summary.aiCredits),
    'Session Time': summary.runs === 0 ? 'N/A' : formatDuration(summary.sessionDurationMs),
    'API Time': summary.runs === 0 ? 'N/A' : formatDuration(summary.totalApiDurationMs),
  }
}

function formatTrialErrors(results: Array<{trial: Trial; result: RunTrialResult}>): string {
  return results
    .flatMap(({trial, result}) => {
      if (result.type === 'success') {
        return []
      }
      return [`Trial "${trial.id}" failed: ${result.error.name}: ${result.error.message}`]
    })
    .join('\n')
}

export {
  REPORT_CHECKS_NOTE,
  REPORT_USAGE_NOTE,
  TRIAL_SUMMARY_COLUMNS,
  addTrialResultToSummary,
  compareTrialSummaries,
  createTrialSummaryComparator,
  createTrialSummary,
  formatTrialSummary,
  formatTrialErrors,
}
export type {TrialSummary}
