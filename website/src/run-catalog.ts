import {listBenchmarkRuns, type BenchmarkRun} from './benchmark-results'
import {list as listBenchmarks} from './benchmarks'
import {list as listExperimentRuns, type Run} from './runs'
import {getRunId} from './run-url'

type CatalogRun = {id: string} & ({collection: 'benchmarks'; run: BenchmarkRun} | {collection: 'experiments'; run: Run})

async function listRuns(): Promise<Array<CatalogRun>> {
  const [benchmarks, experiments] = await Promise.all([listBenchmarks(), listExperimentRuns()])
  const benchmarkRuns = await Promise.all(
    benchmarks.map(benchmark => {
      return listBenchmarkRuns(benchmark.id)
    }),
  )
  const runs: Array<CatalogRun> = [
    ...benchmarkRuns.flat().map(run => {
      return {id: getRunId('benchmarks', run.output.id, run.name), collection: 'benchmarks' as const, run}
    }),
    ...experiments.map(run => {
      return {id: getRunId('experiments', run.output.id, run.name), collection: 'experiments' as const, run}
    }),
  ]
  return runs.toSorted((a, b) => {
    return b.run.date.getTime() - a.run.date.getTime() || a.id.localeCompare(b.id)
  })
}

async function getRun(id: string): Promise<CatalogRun | null> {
  const runs = await listRuns()
  return runs.find(run => run.id === id) ?? null
}

export {listRuns, getRun}
export type {CatalogRun}
