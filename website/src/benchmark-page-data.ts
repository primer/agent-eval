import {get as getBenchmark} from './benchmarks'
import {getBenchmarkOverviewData, getBenchmarkPageResults, listBenchmarkRuns} from './benchmark-results'
import {formatChecks, summarizeTrials} from './check-results'

async function getBenchmarkPageData(id: string) {
  const [benchmark, runs] = await Promise.all([getBenchmark(id), listBenchmarkRuns(id)])

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

export {getBenchmarkPageData}
