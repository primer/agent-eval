import {listBenchmarks} from '../../agent-eval'
import Link from 'next/link'
import {benchmarksDirectory, scenariosDirectory} from '../../env'

export default async function BenchmarksPage() {
  const benchmarks = await listBenchmarks({
    benchmarksDirectory,
    scenariosDirectory,
  })

  return (
    <main>
      <nav>
        <ol>
          <li>
            <Link href="/">Home</Link>
          </li>
          <li>
            <Link href="/benchmarks" aria-current="true">
              Benchmarks
            </Link>
          </li>
        </ol>
      </nav>

      <h1>Benchmarks</h1>
      <ul>
        {benchmarks.map(benchmark => {
          return (
            <li key={benchmark.id}>
              <Link href={`/benchmarks/${benchmark.id}`}>{benchmark.name}</Link>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
