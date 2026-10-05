import {get as getBenchmark, getByName as getBenchmarkByName} from './benchmarks'
import {getBenchmarkOverviewData, getBenchmarkPageResults, listBenchmarkRuns} from './benchmark-results'
import {formatChecks, summarizeTrials} from './check-results'

async function getBenchmarkPageData(id: string) {
  const [benchmark, runs] = await Promise.all([getBenchmark(id), listBenchmarkRuns(id)])

  return createBenchmarkPageData(benchmark, runs)
}

async function getBenchmarkPageDataByName(name: string) {
  const benchmark = await getBenchmarkByName(name)
  const runs = await listBenchmarkRuns(benchmark.id)

  return createBenchmarkPageData(benchmark, runs)
}

function createBenchmarkPageData(
  benchmark: Awaited<ReturnType<typeof getBenchmark>>,
  runs: Awaited<ReturnType<typeof listBenchmarkRuns>>,
) {
  return {
    benchmark,
    overview: getBenchmarkOverviewData(runs),
    results: getBenchmarkPageResults(runs[0]),
    runs: runs.map(run => {
      const trials = [...run.output.trials.values()]
      return {
        id: run.id,
        name: run.name,
        resultCount: trials.length,
        checks: formatChecks(summarizeTrials(trials)),
      }
    }),
  }
}

export {getBenchmarkPageData, getBenchmarkPageDataByName}
