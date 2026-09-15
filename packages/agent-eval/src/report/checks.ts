import type {CheckOutput} from '../check'
import {formatPercentDelta, type TableRow} from './format'

type CheckSummary = {
  scenarioId: string
  name: string
  id?: string
  type: CheckOutput['result']['type']
  unit?: string
  direction?: 'higher-is-better' | 'lower-is-better'
  sum: number
  count: number
  skipped: number
  errors: number
}

type CheckDimension = {
  key: string
  column: string
}

function assertCompatibleChecks(a: CheckSummary, b: CheckSummary): void {
  if (a.type !== b.type || a.unit !== b.unit || a.direction !== b.direction) {
    throw new Error(`Incompatible check results for ${JSON.stringify([a.scenarioId, a.name, a.id ?? null])}`)
  }
}

function addCheckResults(summaries: Map<string, CheckSummary>, scenarioId: string, outputs: Array<CheckOutput>): void {
  const seen = new Set<string>()

  for (const {check, result} of outputs) {
    const key = JSON.stringify(result.id === undefined ? [scenarioId, check.name] : [scenarioId, check.name, result.id])
    if (seen.has(key)) {
      throw new Error(`Duplicate check result for ${key}`)
    }
    seen.add(key)

    const incoming: CheckSummary = {
      scenarioId,
      name: check.name,
      id: result.id,
      type: result.type,
      unit: result.type === 'measurements' ? result.unit : undefined,
      direction: result.type === 'measurements' ? result.direction : 'higher-is-better',
      sum: 0,
      count: 0,
      skipped: 0,
      errors: 0,
    }
    const summary = summaries.get(key) ?? incoming
    assertCompatibleChecks(summary, incoming)

    let sum = 0
    let count = 0
    const values = result.type === 'outcomes' ? result.outcomes : result.measurements
    for (const value of values) {
      if (value.type === 'error') {
        summary.errors += 1
      } else if (value.type === 'measurement') {
        sum += value.value
        count += 1
      } else if (value.status === 'skipped') {
        summary.skipped += 1
      } else {
        sum += value.status === 'passed' ? 100 : 0
        count += 1
      }
    }

    if (count > 0) {
      summary.sum += sum / count
      summary.count += 1
    }
    summaries.set(key, summary)
  }
}

function getCheckValue(summary: CheckSummary | undefined): number | null {
  return summary && summary.count > 0 ? summary.sum / summary.count : null
}

function getCheckDimensions(summaries: Array<{checks: Map<string, CheckSummary>}>): Array<CheckDimension> {
  const checks = new Map<string, CheckSummary>()
  for (const summary of summaries) {
    for (const [key, check] of summary.checks) {
      const previous = checks.get(key)
      if (previous) {
        assertCompatibleChecks(previous, check)
      }
      checks.set(key, check)
    }
  }

  return [...checks.keys()].sort().map(key => {
    return {key, column: `Check ${key}`}
  })
}

function formatCheckSummary(summary: CheckSummary | undefined): string {
  const value = getCheckValue(summary)
  if (value === null || !summary) {
    return 'N/A'
  }

  if (summary.type === 'outcomes') {
    return `${value.toFixed(1)}%`
  }
  return `${value}${summary.unit ? ` ${summary.unit}` : ''}`
}

type CheckSummarySource = {
  checks: Map<string, CheckSummary>
  scenarioRuns: Map<string, number>
}

function getCheckNotes(source: CheckSummarySource, check: CheckSummary | undefined): Array<string> {
  const notes: Array<string> = []
  if (!check) {
    return notes
  }

  const runs = source.scenarioRuns.get(check.scenarioId) ?? 0
  if (check.count !== runs) {
    notes.push(`${check.count}/${runs} runs with values`)
  }
  if (check.skipped > 0) {
    notes.push(`${check.skipped} skipped`)
  }
  if (check.errors > 0) {
    notes.push(`${check.errors} ${check.errors === 1 ? 'error' : 'errors'}`)
  }
  return notes
}

function formatCheckSummaries(
  summary: CheckSummarySource,
  dimensions: Array<CheckDimension>,
  control?: CheckSummarySource,
): TableRow {
  return Object.fromEntries(
    dimensions.map(({key, column}) => {
      const check = summary.checks.get(key)
      let value = formatCheckSummary(check)
      if (control) {
        const baseline = getCheckValue(control.checks.get(key))
        const current = getCheckValue(check)
        const delta = baseline === null || current === null ? 'N/A' : formatPercentDelta(baseline, current)
        value += ` (${delta})`
      }

      const notes = getCheckNotes(summary, check)
      if (control) {
        const controlNotes = getCheckNotes(control, control.checks.get(key))
        if (controlNotes.length > 0) {
          notes.push(`control: ${controlNotes.join('; ')}`)
        }
      }
      if (notes.length > 0) {
        value += ` [${notes.join('; ')}]`
      }
      return [column, value]
    }),
  )
}

export {addCheckResults, formatCheckSummaries, getCheckDimensions, getCheckValue}
export type {CheckDimension, CheckSummary}
