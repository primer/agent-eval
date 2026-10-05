import {PageHeader} from '../components/PageHeader'
import {list} from '../../agent-eval/benchmarks'
import {BenchmarksTable} from './components/BenchmarksTable'
import {BenchmarksPageLayout} from './components/BenchmarksPageLayout'
import {BenchmarksBlankslate} from './components/BenchmarksBlankslate'
import {benchmarksDirectory} from '../../agent-eval/env'

export default async function BenchmarksPage() {
  const benchmarks = await list()

  return (
    <>
      <PageHeader category="benchmarks" />
      <BenchmarksPageLayout>
        {benchmarks.length === 0 ? (
          <BenchmarksBlankslate directory={benchmarksDirectory} />
        ) : (
          <BenchmarksTable
            benchmarks={benchmarks.map(benchmark => {
              return {
                id: benchmark.id,
                name: benchmark.name,
              }
            })}
          />
        )}
      </BenchmarksPageLayout>
    </>
  )
}
