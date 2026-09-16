import fs from 'node:fs/promises'
import path from 'node:path'
import type {BenchmarkOutput, BenchmarkTrialOutput, CheckSummary} from '@primer/agent-eval'
import {readBenchmarkOutput} from './result-files'
import {formatChecks, sortTrialGroups, summarizeTrials} from './check-results'

const {getCheckValue} = await import(
  /* turbopackIgnore: true */
  '@primer/agent-eval'
)

const BENCHMARK_RESULTS_DIR = path.resolve(process.cwd(), '..', 'results', 'benchmarks')

export type BenchmarkComparison = {
  checks: string
  outputTokens: string
  premiumRequests: string
  sessionTime: string
  apiTime: string
}

export type BenchmarkPageResults = {
  date: string
  comparison: BenchmarkComparison
  scenarios: Array<{
    id: string
    comparison: BenchmarkComparison
    models: Array<BenchmarkOverviewResult>
  }>
  capabilities: Array<{
    id: string
    name: string
    comparison: BenchmarkComparison
    scenarios: BenchmarkPageResults['scenarios']
  }>
}

export type BenchmarkOverviewResult = {
  id: string
  model: string
  reasoningEffort: string
  comparison: BenchmarkComparison
}

export type BenchmarkTrendMetricId = string

export type BenchmarkTrendMetricDefinition = {
  id: BenchmarkTrendMetricId
  label: string
  unit?: string
  percentage?: boolean
  scenarioId?: string
}

export type BenchmarkTrendMetric = {
  value: number | null
  raw: string
  change: number | null
  controlValue: number | null
  controlRaw: string | null
}

export type BenchmarkTrendPoint = {
  id: string
  date: string
  capabilityId: string | null
  scenarioId: string | null
  model: string
  reasoningEffort: string
  metrics: Record<BenchmarkTrendMetricId, BenchmarkTrendMetric>
}

export type BenchmarkOverviewData = {
  date: string | null
  results: Array<BenchmarkOverviewResult>
  trends: Array<BenchmarkTrendPoint>
  metrics: Array<BenchmarkTrendMetricDefinition>
  capabilities: Array<{id: string; name: string}>
}

type OutputCandidate = {
  filepath: string
  date: string
}

export type BenchmarkRun = {
  id: string
  name: string
  directory: string
  date: Date
  output: BenchmarkOutput
}

function isRunDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

async function getDatedCandidates(benchmarkId: string): Promise<Array<OutputCandidate>> {
  const directory = path.join(BENCHMARK_RESULTS_DIR, benchmarkId)
  try {
    const entries = await fs.readdir(directory, {withFileTypes: true})
    const candidates = await Promise.all(
      entries
        .filter(entry => {
          return entry.isDirectory() && isRunDate(entry.name)
        })
        .map(async entry => {
          const filepath = path.join(directory, entry.name, 'output.json')
          try {
            await fs.access(filepath)
            return {filepath, date: entry.name}
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
              return null
            }
            throw error
          }
        }),
    )
    return candidates.filter((candidate): candidate is OutputCandidate => {
      return candidate !== null
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    throw error
  }
}

function getPercentDelta(control: number | null, value: number | null): number | null {
  if (control === null || value === null) {
    return null
  }
  if (control === 0) {
    return value === 0 ? 0 : null
  }
  return ((value - control) / control) * 100
}

function formatPercentDelta(control: number | null, value: number | null): string {
  const delta = getPercentDelta(control, value)
  if (delta === null) {
    return 'N/A'
  }
  return delta === 0 ? '0%' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {maximumFractionDigits: 2}).format(value)
}

function formatDuration(milliseconds: number): string {
  const seconds = milliseconds / 1000
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`
  }
  return `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(1)}s`
}

function getTreatments(output: BenchmarkOutput): {controlTreatmentId: string; benchmarkTreatmentId: string} {
  const control = [...output.treatments].find(([, treatment]) => {
    return treatment.name === 'Control'
  })
  const benchmark = [...output.treatments].find(([, treatment]) => {
    return treatment.name === 'Benchmark'
  })
  if (!control || !benchmark) {
    throw new Error(`Benchmark "${output.id}" results must include Control and Benchmark treatments`)
  }
  return {controlTreatmentId: control[0], benchmarkTreatmentId: benchmark[0]}
}

function getSummaries(trials: Array<BenchmarkTrialOutput>, output: BenchmarkOutput) {
  const {controlTreatmentId, benchmarkTreatmentId} = getTreatments(output)
  for (const trial of trials) {
    if (trial.treatmentId !== controlTreatmentId && trial.treatmentId !== benchmarkTreatmentId) {
      throw new Error(`Unexpected benchmark treatment "${trial.treatmentId}" for trial "${trial.id}"`)
    }
  }
  return {
    control: summarizeTrials(
      trials.filter(trial => {
        return trial.treatmentId === controlTreatmentId
      }),
    ),
    benchmark: summarizeTrials(
      trials.filter(trial => {
        return trial.treatmentId === benchmarkTreatmentId
      }),
    ),
  }
}

function createComparison(trials: Array<BenchmarkTrialOutput>, output: BenchmarkOutput): BenchmarkComparison {
  if (trials.length === 0) {
    return {checks: 'N/A', outputTokens: 'N/A', premiumRequests: 'N/A', sessionTime: 'N/A', apiTime: 'N/A'}
  }
  const {control, benchmark} = getSummaries(trials, output)
  function usage(
    key: 'outputTokens' | 'premiumRequests' | 'sessionDurationMs' | 'totalApiDurationMs',
    format: (value: number) => string,
  ) {
    if (benchmark.runs === 0) {
      return 'N/A'
    }
    return `${format(benchmark[key])} (${formatPercentDelta(control.runs > 0 ? control[key] : null, benchmark[key])})`
  }
  return {
    checks: formatChecks(benchmark, control),
    outputTokens: usage('outputTokens', formatNumber),
    premiumRequests: usage('premiumRequests', formatNumber),
    sessionTime: usage('sessionDurationMs', formatDuration),
    apiTime: usage('totalApiDurationMs', formatDuration),
  }
}

function groupTrialsByModel(trials: Array<BenchmarkTrialOutput>): Array<Array<BenchmarkTrialOutput>> {
  const groups = new Map<string, Array<BenchmarkTrialOutput>>()
  for (const trial of trials) {
    const key = JSON.stringify([trial.model.name, trial.model.reasoningEffort])
    const group = groups.get(key) ?? []
    group.push(trial)
    groups.set(key, group)
  }
  return [...groups.values()]
}

function createModelResults(
  trials: Array<BenchmarkTrialOutput>,
  output: BenchmarkOutput,
): Array<BenchmarkOverviewResult> {
  if (trials.length === 0) {
    return []
  }
  const {benchmarkTreatmentId} = getTreatments(output)
  return sortTrialGroups(groupTrialsByModel(trials), benchmarkTreatmentId).map(group => {
    const {model} = group[0]
    return {
      id: JSON.stringify([model.name, model.reasoningEffort]),
      model: model.name,
      reasoningEffort: model.reasoningEffort,
      comparison: createComparison(group, output),
    }
  })
}

function createTrendMetric(
  value: number | null,
  raw: string,
  controlValue: number | null,
  controlRaw: string,
): BenchmarkTrendMetric {
  return {value, raw, change: getPercentDelta(controlValue, value), controlValue, controlRaw}
}

function getCheckMetricId(key: string, check: CheckSummary): string {
  return JSON.stringify(['check', key, check.type, check.unit ?? null, check.direction ?? null])
}

function formatCheckValue(check: CheckSummary | undefined, expected: number): string {
  const value = getCheckValue(check)
  let formatted =
    value === null
      ? 'N/A'
      : check?.type === 'outcomes'
        ? `${value.toFixed(1)}%`
        : `${value}${check?.unit ? ` ${check.unit}` : ''}`
  const notes: Array<string> = []
  if ((check?.count ?? 0) !== expected) {
    notes.push(`${check?.count ?? 0}/${expected} check results with values`)
  }
  if (check && check.skipped > 0) {
    notes.push(`${check.skipped} skipped`)
  }
  if (check && check.errors > 0) {
    notes.push(`${check.errors} errors`)
  }
  if (notes.length > 0) {
    formatted += ` [${notes.join('; ')}]`
  }
  return formatted
}

function createTrendPoint(
  date: string,
  trials: Array<BenchmarkTrialOutput>,
  output: BenchmarkOutput,
  capabilityId: string | null,
  scenarioId: string | null,
  definitions: Map<string, BenchmarkTrendMetricDefinition>,
): BenchmarkTrendPoint {
  const {model} = trials[0]
  const {control, benchmark} = getSummaries(trials, output)
  const metrics: BenchmarkTrendPoint['metrics'] = {}
  for (const [id, key, scale, format] of [
    ['outputTokens', 'outputTokens', 1, formatNumber],
    ['premiumRequests', 'premiumRequests', 1, formatNumber],
    ['sessionTime', 'sessionDurationMs', 1000, formatDuration],
    ['apiTime', 'totalApiDurationMs', 1000, formatDuration],
  ] as const) {
    const value = benchmark.runs > 0 ? benchmark[key] : null
    const baseline = control.runs > 0 ? control[key] : null
    metrics[id] = createTrendMetric(
      value === null ? null : value / scale,
      value === null ? 'N/A' : format(value),
      baseline === null ? null : baseline / scale,
      baseline === null ? 'N/A' : format(baseline),
    )
  }
  // Validate matching check types, units, and directions before comparing them.
  formatChecks(benchmark, control)
  for (const [key, check] of new Map([...control.checks, ...benchmark.checks])) {
    const id = getCheckMetricId(key, check)
    definitions.set(id, {
      id,
      label:
        [check.scenarioId, check.name, check.id]
          .filter(part => {
            return part !== undefined
          })
          .join(' / ') +
        (check.type === 'measurements' ? ` (${check.unit ?? 'unitless'}, ${check.direction ?? 'no direction'})` : ''),
      unit: check.type === 'outcomes' ? '%' : check.unit,
      percentage: check.type === 'outcomes',
      scenarioId: check.scenarioId,
    })
    metrics[id] = createTrendMetric(
      getCheckValue(benchmark.checks.get(key)),
      formatCheckValue(benchmark.checks.get(key), benchmark.scenarioRuns.get(check.scenarioId) ?? 0),
      getCheckValue(control.checks.get(key)),
      formatCheckValue(control.checks.get(key), control.scenarioRuns.get(check.scenarioId) ?? 0),
    )
  }
  return {
    id: JSON.stringify([date, capabilityId, scenarioId, model.name, model.reasoningEffort]),
    date,
    capabilityId,
    scenarioId,
    model: model.name,
    reasoningEffort: model.reasoningEffort,
    metrics,
  }
}

export function getBenchmarkOverviewData(runs: Array<BenchmarkRun>): BenchmarkOverviewData {
  const latest = runs[0]
  const capabilities = new Map<string, {id: string; name: string}>()
  for (const run of runs) {
    for (const capability of run.output.capabilities.values()) {
      if (!capabilities.has(capability.id)) {
        capabilities.set(capability.id, {id: capability.id, name: capability.name})
      }
    }
  }
  const definitions = new Map<string, BenchmarkTrendMetricDefinition>(
    [
      {id: 'outputTokens', label: 'Output tokens'},
      {id: 'premiumRequests', label: 'Premium requests'},
      {id: 'sessionTime', label: 'Session time', unit: 's'},
      {id: 'apiTime', label: 'API time', unit: 's'},
    ].map(metric => {
      return [metric.id, metric]
    }),
  )
  const trends = runs.flatMap(run => {
    const trials = [...run.output.trials.values()]
    return [null, ...run.output.capabilities.keys()].flatMap(capabilityId => {
      const capabilityTrials =
        capabilityId === null
          ? trials
          : trials.filter(trial => {
              return trial.capabilityId === capabilityId
            })
      const scenarioIds = new Set(
        capabilityTrials.map(trial => {
          return trial.scenarioId
        }),
      )
      return [null, ...scenarioIds].flatMap(scenarioId => {
        const selected =
          scenarioId === null
            ? capabilityTrials
            : capabilityTrials.filter(trial => {
                return trial.scenarioId === scenarioId
              })
        return groupTrialsByModel(selected).map(group => {
          return createTrendPoint(run.name, group, run.output, capabilityId, scenarioId, definitions)
        })
      })
    })
  })
  for (const point of trends) {
    for (const id of definitions.keys()) {
      point.metrics[id] ??= createTrendMetric(null, 'N/A', null, 'N/A')
    }
  }
  return {
    date: latest?.name ?? null,
    results: latest ? createModelResults([...latest.output.trials.values()], latest.output) : [],
    trends,
    metrics: [...definitions.values()],
    capabilities: [...capabilities.values()],
  }
}

export async function listBenchmarkRuns(benchmarkId: string): Promise<Array<BenchmarkRun>> {
  const candidates = (await getDatedCandidates(benchmarkId)).toSorted((a, b) => {
    return b.date.localeCompare(a.date)
  })
  const runs: Array<BenchmarkRun> = []
  for (const candidate of candidates) {
    const output = await readBenchmarkOutput(candidate.filepath)
    if (output === null) {
      continue
    }
    if (output.id !== benchmarkId) {
      throw new Error(`Benchmark ID "${output.id}" does not match "${benchmarkId}" in ${candidate.filepath}`)
    }
    runs.push({
      id: candidate.date,
      name: candidate.date,
      directory: path.dirname(candidate.filepath),
      date: new Date(`${candidate.date}T00:00:00.000Z`),
      output,
    })
  }
  return runs
}

export async function getBenchmarkRun(benchmarkId: string, date: string): Promise<BenchmarkRun | null> {
  if (!isRunDate(date)) {
    return null
  }
  const runs = await listBenchmarkRuns(benchmarkId)
  return (
    runs.find(run => {
      return run.name === date
    }) ?? null
  )
}

function createScenarioResults(
  trials: Array<BenchmarkTrialOutput>,
  output: BenchmarkOutput,
  scenarioIds: Iterable<string> = new Set(
    trials.map(trial => {
      return trial.scenarioId
    }),
  ),
): BenchmarkPageResults['scenarios'] {
  return [...new Set(scenarioIds)].map(id => {
    const scenarioTrials = trials.filter(trial => {
      return trial.scenarioId === id
    })
    return {
      id,
      comparison: createComparison(scenarioTrials, output),
      models: createModelResults(scenarioTrials, output),
    }
  })
}

export function getBenchmarkPageResults(run: BenchmarkRun | undefined): BenchmarkPageResults | null {
  if (!run) {
    return null
  }
  const output = run.output
  const trials = [...output.trials.values()]
  return {
    date: run.name,
    comparison: createComparison(trials, output),
    scenarios: createScenarioResults(trials, output),
    capabilities: [...output.capabilities.values()].map(capability => {
      const capabilityTrials = trials.filter(trial => {
        return trial.capabilityId === capability.id
      })
      return {
        id: capability.id,
        name: capability.name,
        comparison: createComparison(capabilityTrials, output),
        scenarios: createScenarioResults(capabilityTrials, output, capability.scenarioIds),
      }
    }),
  }
}
