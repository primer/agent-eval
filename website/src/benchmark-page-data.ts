import {get as getBenchmark} from './benchmarks'
import {getBenchmarkOverviewData, getBenchmarkPageResults, listBenchmarkRuns} from './benchmark-results'

async function getBenchmarkPageData(id: string) {
  const [benchmark, runs] = await Promise.all([getBenchmark(id), listBenchmarkRuns(id)])

  return {
    benchmark,
    overview: getBenchmarkOverviewData(runs),
    results: getBenchmarkPageResults(benchmark, runs[0]),
    runs: runs.map(run => {
      const trials = [...run.output.trials.values()]
      return {
        id: run.id,
        name: run.name,
        resultCount: trials.length,
        passedTests: trials.reduce((total, trial) => {
          return total + trial.testResults.numPassedTests
        }, 0),
        totalTests: trials.reduce((total, trial) => {
          return total + trial.testResults.numTotalTests
        }, 0),
      }
    }),
  }
}

export {getBenchmarkPageData}
