import {getBenchmark, listBenchmarks} from '../../../agent-eval'
import {Link} from '../../../components/Link'
import {benchmarksDirectory, scenariosDirectory} from '../../../env'

export const dynamicParams = false

type Props = {
  params: Promise<{id: string}>
}

export default async function BenchmarkPage(props: Props) {
  const params = await props.params
  const benchmark = await getBenchmark({
    benchmarksDirectory,
    scenariosDirectory,
    id: params.id,
  })
  return (
    <>
      <main>
        <nav>
          <ol>
            <li>
              <Link href="/benchmarks">Benchmarks</Link>
            </li>
            <li>
              <Link href={`/benchmarks/${params.id}`} aria-current="page">
                {benchmark.name}
              </Link>
            </li>
          </ol>
        </nav>
        <h1>Benchmark {benchmark.name}</h1>
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
