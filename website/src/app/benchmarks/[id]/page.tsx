import {get, list} from '../../../benchmarks'
import {getBenchmarkPageResults, listBenchmarkRuns} from '../../../benchmark-results'
import {Page} from './components/Page'

type BenchmarkPageProps = {
  params: Promise<{
    id: string
  }>
}

export const dynamicParams = false

export default async function BenchmarkPage(props: BenchmarkPageProps) {
  const {id} = await props.params
  const [benchmark, runs] = await Promise.all([get(id), listBenchmarkRuns(id)])
  const results = getBenchmarkPageResults(benchmark, runs[0])

  return (
    <Page
      benchmark={benchmark}
      results={results}
      runs={runs.map(run => {
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
      })}
    />
  )
}

export async function generateStaticParams() {
  const benchmarks = await list()
  return benchmarks.map(benchmark => {
    return {
      id: benchmark.id,
    }
  })
}
