import type {RunTrialResult} from './run'
import {formatDuration, formatNumber, type TableRow} from '../report/format'

type TrialSummary = {
  runs: number
  outputTokens: number
  premiumRequests: number
  sessionDurationMs: number
  totalApiDurationMs: number
}

const TRIAL_SUMMARY_COLUMNS = ['Runs', 'Output Tokens', 'Premium Requests', 'Session Time', 'API Time']

const REPORT_USAGE_NOTE = 'Usage totals include implementation-agent sessions only (judge sessions excluded).'

function createTrialSummary(): TrialSummary {
  return {
    runs: 0,
    outputTokens: 0,
    premiumRequests: 0,
    sessionDurationMs: 0,
    totalApiDurationMs: 0,
  }
}

function addTrialResultToSummary(summary: TrialSummary, result: RunTrialResult): void {
  summary.runs += 1

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

function formatTrialSummary(summary: TrialSummary): TableRow {
  return {
    Runs: summary.runs,
    'Output Tokens': formatNumber(summary.outputTokens),
    'Premium Requests': formatNumber(summary.premiumRequests),
    'Session Time': formatDuration(summary.sessionDurationMs),
    'API Time': formatDuration(summary.totalApiDurationMs),
  }
}

export {
  REPORT_USAGE_NOTE,
  TRIAL_SUMMARY_COLUMNS,
  addTrialResultToSummary,
  compareTrialSummaries,
  createTrialSummary,
  formatTrialSummary,
}
export type {TrialSummary}
