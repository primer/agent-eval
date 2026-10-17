import {listBenchmarks} from '@primer/agent-eval'
import {benchmarksDirectory, scenariosDirectory} from '../../../env'

export const dynamicParams = false

type Props = {
  params: Promise<{id: string}>
}

export default async function BenchmarkPage(props: Props) {
  const params = await props.params
  return (
    <>
      <main>
        <h1>Benchmark {params.id}</h1>
      </main>
    </>
  )
}

export async function generateStaticParams() {
  const benchmarks = await listBenchmarks({
    benchmarksDirectory,
    scenariosDirectory,
  })

  return benchmarks.map(benchmark => {
    return {
      id: benchmark.id,
    }
  })
}
