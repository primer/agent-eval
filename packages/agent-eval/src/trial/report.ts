import type {RunTrialResult} from './run'
import {formatDuration, formatNumber, type TableRow} from '../report/format'
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
  checks: Map<string, CheckSummary>
  scenarioRuns: Map<string, number>
  outputTokens: number
  premiumRequests: number
  sessionDurationMs: number
  totalApiDurationMs: number
}

const TRIAL_SUMMARY_COLUMNS = ['Runs', 'Output Tokens', 'Premium Requests', 'Session Time', 'API Time']

const REPORT_USAGE_NOTE = 'Usage totals include implementation-agent sessions only (judge sessions excluded).'

const REPORT_CHECKS_NOTE =
  'Checks show mean per-trial pass percentages or measurement means. Skipped outcomes and errors are excluded from values and shown separately. ' +
  'Ordering uses equal-weight ranks across shared checks with values for every run and no errors; measurements without a direction are not ranked. Usage breaks ties.'

function createTrialSummary(): TrialSummary {
  return {
    runs: 0,
    checks: new Map(),
    scenarioRuns: new Map(),
    outputTokens: 0,
    premiumRequests: 0,
    sessionDurationMs: 0,
    totalApiDurationMs: 0,
  }
}

function addTrialResultToSummary(summary: TrialSummary, result: RunTrialResult): void {
  summary.runs += 1
  const scenarioId = result.trial.scenario.id
  summary.scenarioRuns.set(scenarioId, (summary.scenarioRuns.get(scenarioId) ?? 0) + 1)
  addCheckResults(summary.checks, scenarioId, result.checks)

  for (const session of result.agent.sessions) {
    summary.outputTokens += session.outputTokens
    summary.premiumRequests += session.premiumRequests
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
    return (ranks.get(a) ?? 0) - (ranks.get(b) ?? 0) || compareTrialSummaries(a, b)
  }
}

function formatTrialSummary(summary: TrialSummary, dimensions: Array<CheckDimension> = []): TableRow {
  return {
    Runs: summary.runs,
    ...formatCheckSummaries(summary, dimensions),
    'Output Tokens': formatNumber(summary.outputTokens),
    'Premium Requests': formatNumber(summary.premiumRequests),
    'Session Time': formatDuration(summary.sessionDurationMs),
    'API Time': formatDuration(summary.totalApiDurationMs),
  }
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
}
export type {TrialSummary}
