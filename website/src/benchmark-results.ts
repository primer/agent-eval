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
}

export type BenchmarkComparison = {
  control: string
  benchmark: string
  delta: string
  controlTests: string
  benchmarkTests: string
  deltaValue: number | null
}

export type BenchmarkCapabilityResult = {
  id: string
  name: string
  comparison: BenchmarkComparison
  scenarios: Array<{
    id: string
    comparison: BenchmarkComparison
  }>
}

export type BenchmarkPageResults = {
  date: string
  capabilities: Array<BenchmarkCapabilityResult>
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
      return totals
    },
    {passed: 0, total: 0},
  )
}

function getPassRate(totals: ResultTotals): number | null {
  if (totals.total === 0) {
    return null
  }

  return totals.passed / totals.total
}

function formatRate(rate: number | null): string {
  if (rate === null) {
    return 'N/A'
  }

  return `${(rate * 100).toFixed(1)}%`
}

function formatTests(totals: ResultTotals): string {
  if (totals.total === 0) {
    return 'N/A'
  }

  return `${totals.passed}/${totals.total}`
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
  const controlRate = getPassRate(controlTotals)
  const benchmarkRate = getPassRate(benchmarkTotals)
  const deltaValue = controlRate === null || benchmarkRate === null ? null : benchmarkRate - controlRate

  return {
    control: formatRate(controlRate),
    benchmark: formatRate(benchmarkRate),
    delta:
      deltaValue === null ? 'N/A' : `${deltaValue > 0 ? '+' : ''}${(deltaValue * 100).toFixed(1)} percentage points`,
    controlTests: formatTests(controlTotals),
    benchmarkTests: formatTests(benchmarkTotals),
    deltaValue,
  }
}

function createPageResults(benchmark: Benchmark, output: BenchmarkOutput, date: string): BenchmarkPageResults {
  const controlTreatment = [...output.treatments].find(([, treatment]) => {
    return treatment.name === 'Control'
  })
  const benchmarkTreatment = [...output.treatments].find(([, treatment]) => {
    return treatment.name === 'Benchmark'
  })

  if (!controlTreatment || !benchmarkTreatment) {
    throw new Error(`Benchmark "${benchmark.id}" results must include Control and Benchmark treatments`)
  }

  const trials = [...output.trials.values()]
  const capabilities = benchmark.capabilities.map((capability, capabilityIndex) => {
    const capabilityTrials = trials.filter(trial => {
      return trial.capabilityId === capability.name
    })

    return {
      id: `${capabilityIndex}-${capability.name}`,
      name: capability.name,
      comparison: createComparison(capabilityTrials, controlTreatment[0], benchmarkTreatment[0]),
      scenarios: capability.scenarios.map(scenario => {
        const scenarioTrials = capabilityTrials.filter(trial => {
          return trial.scenarioId === scenario.id
        })

        return {
          id: scenario.id,
          comparison: createComparison(scenarioTrials, controlTreatment[0], benchmarkTreatment[0]),
        }
      }),
    }
  })

  return {date, capabilities}
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
