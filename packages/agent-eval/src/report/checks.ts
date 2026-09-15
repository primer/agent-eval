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

type CheckDimension = Pick<CheckSummary, 'scenarioId' | 'type' | 'unit' | 'direction'> & {
  key: string
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

  return [...checks]
    .sort(([a], [b]) => {
      return a.localeCompare(b)
    })
    .map(([key, {scenarioId, type, unit, direction}]) => {
      return {key, scenarioId, type, unit, direction}
    })
}

type CheckRollup = Pick<CheckSummary, 'type' | 'unit' | 'direction' | 'sum' | 'count' | 'skipped' | 'errors'> & {
  expected: number
}

function formatCheckSummary(summary: CheckRollup): string {
  if (summary.count === 0) {
    return 'N/A'
  }

  const value = summary.sum / summary.count
  if (summary.type === 'outcomes') {
    return `${value.toFixed(1)}%`
  }
  return `${value}${summary.unit ? ` ${summary.unit}` : ''}`
}

type CheckSummarySource = {
  checks: Map<string, CheckSummary>
  scenarioRuns: Map<string, number>
}

function rollupChecks(source: CheckSummarySource, dimensions: Array<CheckDimension>): CheckRollup {
  const {type, unit, direction} = dimensions[0]
  const rollup: CheckRollup = {type, unit, direction, sum: 0, count: 0, skipped: 0, errors: 0, expected: 0}
  for (const {key, scenarioId} of dimensions) {
    rollup.expected += source.scenarioRuns.get(scenarioId) ?? 0
    const check = source.checks.get(key)
    if (check) {
      rollup.sum += check.sum
      rollup.count += check.count
      rollup.skipped += check.skipped
      rollup.errors += check.errors
    }
  }
  return rollup
}

function getCheckNotes(check: CheckRollup): Array<string> {
  const notes: Array<string> = []
  if (check.count !== check.expected) {
    notes.push(`${check.count}/${check.expected} check results with values`)
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
  if (dimensions.length === 0) {
    return {}
  }

  const groups = new Map<string, Array<CheckDimension>>()
  for (const dimension of dimensions) {
    if (!summary.scenarioRuns.has(dimension.scenarioId) && !control?.scenarioRuns.has(dimension.scenarioId)) {
      continue
    }
    const key = JSON.stringify([dimension.type, dimension.unit, dimension.direction])
    const group = groups.get(key) ?? []
    group.push(dimension)
    groups.set(key, group)
  }

  const values = [...groups]
    .sort(([a], [b]) => {
      return a.localeCompare(b)
    })
    .map(([, group]) => {
      const check = rollupChecks(summary, group)
      let value = formatCheckSummary(check)
      if (control) {
        const baseline = rollupChecks(control, group)
        const delta =
          baseline.count === 0 || check.count === 0
            ? 'N/A'
            : formatPercentDelta(baseline.sum / baseline.count, check.sum / check.count)
        value += ` (${delta})`
      }

      const notes = getCheckNotes(check)
      if (
        check.type === 'measurements' &&
        [...groups.values()].some(other => {
          return other !== group && other[0].type === check.type && other[0].unit === check.unit
        })
      ) {
        notes.unshift(check.direction ?? 'no direction')
      }
      if (control) {
        const controlNotes = getCheckNotes(rollupChecks(control, group))
        if (controlNotes.length > 0) {
          notes.push(`control: ${controlNotes.join('; ')}`)
        }
      }
      if (notes.length > 0) {
        value += ` [${notes.join('; ')}]`
      }
      return value
    })
  return {Checks: values.length > 0 ? values.join('; ') : 'N/A'}
}

export {addCheckResults, formatCheckSummaries, getCheckDimensions, getCheckValue}
export type {CheckDimension, CheckSummary}
