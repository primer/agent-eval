import {BenchmarksTable} from '../components/ResourceTables'
import {list as listBenchmarks} from '../../benchmarks'
import {listBenchmarkRuns} from '../../benchmark-results'
import {getRunSummary} from '../../evaluation-state'

export const metadata = {
  title: 'Benchmarks',
}

export default async function BenchmarksPage() {
  const benchmarks = await Promise.all(
    (await listBenchmarks()).map(async benchmark => {
      const run = (await listBenchmarkRuns(benchmark.id))[0]
      return {
        ...benchmark,
        latestRun: run
          ? {
              date: run.name,
              ...getRunSummary(run.output.trials.values()),
            }
          : null,
      }
    }),
  )
  return <BenchmarksTable benchmarks={benchmarks} headingLevel="h1" standalone />
}
