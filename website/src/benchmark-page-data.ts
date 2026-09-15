import {get as getBenchmark} from './benchmarks'
import {getBenchmarkOverviewData, getBenchmarkPageResults, listBenchmarkRuns} from './benchmark-results'
import {formatChecks, summarizeTrials} from './check-results'

async function getBenchmarkPageData(id: string) {
  const [benchmark, runs] = await Promise.all([getBenchmark(id), listBenchmarkRuns(id)])

  return {
    benchmark,
    overview: getBenchmarkOverviewData(runs),
    results: getBenchmarkPageResults(
      runs.find(run => {
        return run.output !== null
      }),
    ),
    runs: runs.map(run => {
      const trials = run.output ? [...run.output.trials.values()] : null
      return {
        id: run.id,
        name: run.name,
        resultCount: trials?.length ?? null,
        checks: trials ? formatChecks(summarizeTrials(trials)) : 'Unavailable',
        unavailableReason: run.unavailableReason,
      }
    }),
  }
}

export {getBenchmarkPageData}
