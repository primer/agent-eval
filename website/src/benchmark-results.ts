import fs from 'node:fs/promises'
import path from 'node:path'
import type {BenchmarkOutput} from '@primer/agent-eval/benchmark'
import type {Benchmark} from './benchmarks'

const {deserialize} = await import(
  /* turbopackIgnore: true */
  '@primer/agent-eval/benchmark'
)

const REPOSITORY_ROOT = path.resolve(process.cwd(), '..')
const BENCHMARK_RESULTS_DIR = path.join(REPOSITORY_ROOT, 'results', 'benchmarks')

type BenchmarkOutputTrial = BenchmarkOutput['trials'] extends Map<string, infer Trial> ? Trial : never

type ResultTotals = {
  passed: number
  total: number
  outputTokens: number
  premiumRequests: number
  sessionDurationMs: number
  totalApiDurationMs: number
}

export type BenchmarkComparison = {
  tests: string
  outputTokens: string
  premiumRequests: string
  sessionTime: string
  apiTime: string
}

export type BenchmarkCapabilityResult = {
  id: string
  name: string
  comparison: BenchmarkComparison
  scenarios: Array<{
    id: string
    comparison: BenchmarkComparison
    models: Array<{
      id: string
      name: string
      reasoningEffort: string
      comparison: BenchmarkComparison
    }>
  }>
}

export type BenchmarkPageResults = {
  date: string
  capabilities: Array<BenchmarkCapabilityResult>
}

export type BenchmarkOverviewResult = {
  id: string
  model: string
  reasoningEffort: string
  comparison: BenchmarkComparison
}

export type BenchmarkTrendMetricId = 'tests' | 'outputTokens' | 'premiumRequests' | 'sessionTime' | 'apiTime'

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
  model: string
  reasoningEffort: string
  metrics: Record<BenchmarkTrendMetricId, BenchmarkTrendMetric>
}

export type BenchmarkOverviewData = {
  date: string | null
  results: Array<BenchmarkOverviewResult>
  trends: Array<BenchmarkTrendPoint>
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
            return {
              filepath,
              date: entry.name,
            }
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

async function readBenchmarkOutput(candidate: OutputCandidate, benchmarkId: string): Promise<BenchmarkOutput | null> {
  const contents = await fs.readFile(candidate.filepath, 'utf-8')
  const parsed: unknown = JSON.parse(contents)
  const output = deserialize(parsed)
  return output.benchmarkId === benchmarkId ? output : null
}

function getTotals(trials: Array<BenchmarkOutputTrial>): ResultTotals {
  return trials.reduce(
    (totals, trial) => {
      totals.passed += trial.testResults.numPassedTests
      totals.total += trial.testResults.numTotalTests
      for (const session of trial.agent.sessions) {
        totals.outputTokens += session.outputTokens
        totals.premiumRequests += session.premiumRequests
        totals.sessionDurationMs += session.sessionDurationMs
        totals.totalApiDurationMs += session.totalApiDurationMs
      }
      return totals
    },
    {
      passed: 0,
      total: 0,
      outputTokens: 0,
      premiumRequests: 0,
      sessionDurationMs: 0,
      totalApiDurationMs: 0,
    },
  )
}

function getPassRate(totals: ResultTotals): number | null {
  if (totals.total === 0) {
    return null
  }

  return totals.passed / totals.total
}

function getPercentDelta(control: number, benchmark: number): number | null {
  if (control === 0) {
    return benchmark === 0 ? 0 : null
  }

  return (benchmark - control) / control
}

function getPercentDeltaValue(control: number, benchmark: number): number | null {
  const delta = getPercentDelta(control, benchmark)
  return delta === null ? null : delta * 100
}

function formatPercentDelta(control: number, benchmark: number): string {
  const delta = getPercentDelta(control, benchmark)
  if (delta === null) {
    return 'N/A'
  }

  const sign = delta > 0 ? '+' : ''
  return `${sign}${(delta * 100).toFixed(1)}%`
}

function formatValue(value: string, control: number, benchmark: number): string {
  return `${value} (${formatPercentDelta(control, benchmark)})`
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatDuration(milliseconds: number): string {
  const seconds = milliseconds / 1000
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds - minutes * 60
  return `${minutes}m ${remainingSeconds.toFixed(1)}s`
}

function createComparison(
  trials: Array<BenchmarkOutputTrial>,
  controlTreatmentId: string,
  benchmarkTreatmentId: string,
): BenchmarkComparison {
  const controlTotals = getTotals(
    trials.filter(trial => {
      return trial.treatmentId === controlTreatmentId
    }),
  )
  const benchmarkTotals = getTotals(
    trials.filter(trial => {
      return trial.treatmentId === benchmarkTreatmentId
    }),
  )

  return {
    tests: formatValue(
      `${benchmarkTotals.passed}/${benchmarkTotals.total}`,
      controlTotals.passed,
      benchmarkTotals.passed,
    ),
    outputTokens: formatValue(
      formatNumber(benchmarkTotals.outputTokens),
      controlTotals.outputTokens,
      benchmarkTotals.outputTokens,
    ),
    premiumRequests: formatValue(
      formatNumber(benchmarkTotals.premiumRequests),
      controlTotals.premiumRequests,
      benchmarkTotals.premiumRequests,
    ),
    sessionTime: formatValue(
      formatDuration(benchmarkTotals.sessionDurationMs),
      controlTotals.sessionDurationMs,
      benchmarkTotals.sessionDurationMs,
    ),
    apiTime: formatValue(
      formatDuration(benchmarkTotals.totalApiDurationMs),
      controlTotals.totalApiDurationMs,
      benchmarkTotals.totalApiDurationMs,
    ),
  }
}

function getTreatments(output: BenchmarkOutput): {
  controlTreatmentId: string
  benchmarkTreatmentId: string
} {
  const controlTreatment = [...output.treatments].find(([, treatment]) => {
    return treatment.name === 'Control'
  })
  const benchmarkTreatment = [...output.treatments].find(([, treatment]) => {
    return treatment.name === 'Benchmark'
  })

  if (!controlTreatment || !benchmarkTreatment) {
    throw new Error(`Benchmark "${output.benchmarkId}" results must include Control and Benchmark treatments`)
  }

  return {
    controlTreatmentId: controlTreatment[0],
    benchmarkTreatmentId: benchmarkTreatment[0],
  }
}

function groupTrialsByModel(trials: Array<BenchmarkOutputTrial>): Array<Array<BenchmarkOutputTrial>> {
  const modelTrials = new Map<string, Array<BenchmarkOutputTrial>>()
  for (const trial of trials) {
    const key = `${trial.model.name}\0${trial.model.reasoningEffort}`
    const trialsForModel = modelTrials.get(key) ?? []
    trialsForModel.push(trial)
    modelTrials.set(key, trialsForModel)
  }
  return [...modelTrials.values()]
}

function createTrendMetric(
  value: number | null,
  raw: string,
  controlValue: number | null,
  controlRaw: string | null,
  controlDeltaValue: number,
  benchmarkDeltaValue: number,
): BenchmarkTrendMetric {
  return {
    value,
    raw,
    change: getPercentDeltaValue(controlDeltaValue, benchmarkDeltaValue),
    controlValue,
    controlRaw,
  }
}

function createTrendPoint(
  date: string,
  trials: Array<BenchmarkOutputTrial>,
  controlTreatmentId: string,
  benchmarkTreatmentId: string,
): BenchmarkTrendPoint {
  const trial = trials[0]
  const controlTotals = getTotals(
    trials.filter(candidate => {
      return candidate.treatmentId === controlTreatmentId
    }),
  )
  const benchmarkTotals = getTotals(
    trials.filter(candidate => {
      return candidate.treatmentId === benchmarkTreatmentId
    }),
  )
  const controlPassRate = getPassRate(controlTotals)
  const benchmarkPassRate = getPassRate(benchmarkTotals)

  return {
    id: `${date}:${trial.model.name}:${trial.model.reasoningEffort}`,
    date,
    model: trial.model.name,
    reasoningEffort: trial.model.reasoningEffort,
    metrics: {
      tests: createTrendMetric(
        benchmarkPassRate === null ? null : benchmarkPassRate * 100,
        `${benchmarkTotals.passed}/${benchmarkTotals.total}`,
        controlPassRate === null ? null : controlPassRate * 100,
        `${controlTotals.passed}/${controlTotals.total}`,
        controlTotals.passed,
        benchmarkTotals.passed,
      ),
      outputTokens: createTrendMetric(
        benchmarkTotals.outputTokens,
        formatNumber(benchmarkTotals.outputTokens),
        controlTotals.outputTokens,
        formatNumber(controlTotals.outputTokens),
        controlTotals.outputTokens,
        benchmarkTotals.outputTokens,
      ),
      premiumRequests: createTrendMetric(
        benchmarkTotals.premiumRequests,
        formatNumber(benchmarkTotals.premiumRequests),
        controlTotals.premiumRequests,
        formatNumber(controlTotals.premiumRequests),
        controlTotals.premiumRequests,
        benchmarkTotals.premiumRequests,
      ),
      sessionTime: createTrendMetric(
        benchmarkTotals.sessionDurationMs / 1000,
        formatDuration(benchmarkTotals.sessionDurationMs),
        controlTotals.sessionDurationMs / 1000,
        formatDuration(controlTotals.sessionDurationMs),
        controlTotals.sessionDurationMs,
        benchmarkTotals.sessionDurationMs,
      ),
      apiTime: createTrendMetric(
        benchmarkTotals.totalApiDurationMs / 1000,
        formatDuration(benchmarkTotals.totalApiDurationMs),
        controlTotals.totalApiDurationMs / 1000,
        formatDuration(controlTotals.totalApiDurationMs),
        controlTotals.totalApiDurationMs,
        benchmarkTotals.totalApiDurationMs,
      ),
    },
  }
}

function compareModelPerformance(
  a: Array<BenchmarkOutputTrial>,
  b: Array<BenchmarkOutputTrial>,
  benchmarkTreatmentId: string,
): number {
  const aTotals = getTotals(
    a.filter(trial => {
      return trial.treatmentId === benchmarkTreatmentId
    }),
  )
  const bTotals = getTotals(
    b.filter(trial => {
      return trial.treatmentId === benchmarkTreatmentId
    }),
  )

  return (
    (getPassRate(bTotals) ?? 0) - (getPassRate(aTotals) ?? 0) ||
    aTotals.outputTokens - bTotals.outputTokens ||
    aTotals.premiumRequests - bTotals.premiumRequests ||
    aTotals.sessionDurationMs - bTotals.sessionDurationMs ||
    aTotals.totalApiDurationMs - bTotals.totalApiDurationMs
  )
}

function createPageResults(benchmark: Benchmark, output: BenchmarkOutput, date: string): BenchmarkPageResults {
  const {controlTreatmentId, benchmarkTreatmentId} = getTreatments(output)

  const trials = [...output.trials.values()]
  const capabilities = benchmark.capabilities.map((capability, capabilityIndex) => {
    const capabilityTrials = trials.filter(trial => {
      return trial.capabilityId === capability.name
    })

    return {
      id: `${capabilityIndex}-${capability.name}`,
      name: capability.name,
      comparison: createComparison(capabilityTrials, controlTreatmentId, benchmarkTreatmentId),
      scenarios: capability.scenarios.map(scenario => {
        const scenarioTrials = capabilityTrials.filter(trial => {
          return trial.scenarioId === scenario.id
        })
        return {
          id: scenario.id,
          comparison: createComparison(scenarioTrials, controlTreatmentId, benchmarkTreatmentId),
          models: groupTrialsByModel(scenarioTrials)
            .toSorted((a, b) => {
              return compareModelPerformance(a, b, benchmarkTreatmentId)
            })
            .map(trialsForModel => {
              const trial = trialsForModel[0]
              return {
                id: `${trial.model.name}\0${trial.model.reasoningEffort}`,
                name: trial.model.name,
                reasoningEffort: trial.model.reasoningEffort,
                comparison: createComparison(trialsForModel, controlTreatmentId, benchmarkTreatmentId),
              }
            }),
        }
      }),
    }
  })

  return {date, capabilities}
}

export function getBenchmarkOverviewData(runs: Array<BenchmarkRun>): BenchmarkOverviewData {
  const latestRun = runs[0]
  const results = latestRun
    ? (() => {
        const {controlTreatmentId, benchmarkTreatmentId} = getTreatments(latestRun.output)
        return groupTrialsByModel([...latestRun.output.trials.values()])
          .toSorted((a, b) => {
            return compareModelPerformance(a, b, benchmarkTreatmentId)
          })
          .map(trials => {
            const trial = trials[0]
            return {
              id: `${trial.model.name}\0${trial.model.reasoningEffort}`,
              model: trial.model.name,
              reasoningEffort: trial.model.reasoningEffort,
              comparison: createComparison(trials, controlTreatmentId, benchmarkTreatmentId),
            }
          })
      })()
    : []
  const trends = runs.flatMap(run => {
    const {controlTreatmentId, benchmarkTreatmentId} = getTreatments(run.output)
    return groupTrialsByModel([...run.output.trials.values()]).map(trials => {
      return createTrendPoint(run.name, trials, controlTreatmentId, benchmarkTreatmentId)
    })
  })

  return {
    date: latestRun?.name ?? null,
    results,
    trends,
  }
}

export async function listBenchmarkRuns(benchmarkId: string): Promise<Array<BenchmarkRun>> {
  const candidates = (await getDatedCandidates(benchmarkId)).toSorted((a, b) => {
    return b.date.localeCompare(a.date)
  })

  const runs: Array<BenchmarkRun> = []
  for (const candidate of candidates) {
    const output = await readBenchmarkOutput(candidate, benchmarkId)
    if (output) {
      runs.push({
        id: candidate.date,
        name: candidate.date,
        directory: path.dirname(candidate.filepath),
        date: new Date(`${candidate.date}T00:00:00.000Z`),
        output,
      })
    }
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

export function getBenchmarkPageResults(
  benchmark: Benchmark,
  run: BenchmarkRun | undefined,
): BenchmarkPageResults | null {
  return run ? createPageResults(benchmark, run.output, run.name) : null
}
