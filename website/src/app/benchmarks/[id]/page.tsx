import {getBenchmarkPageData} from '../../../benchmark-page-data'
import {list} from '../../../benchmarks'
import {Page} from './components/Page'

type BenchmarkPageProps = {
  params: Promise<{
    id: string
  }>
}

export const dynamicParams = false

export default async function BenchmarkPage(props: BenchmarkPageProps) {
  const {id} = await props.params
  const {benchmark, results, runs} = await getBenchmarkPageData(id)

  return <Page benchmark={benchmark} results={results} runs={runs} />
}

export async function generateStaticParams() {
  const benchmarks = await list()
  return benchmarks.map(benchmark => {
    return {
      id: benchmark.id,
    }
  })
}
