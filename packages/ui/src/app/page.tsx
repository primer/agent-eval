import {connection} from 'next/server'
import {listBenchmarks} from '@primer/agent-eval-core'
import {benchmarksDirectory, scenariosDirectory} from '../env'

export default async function IndexPage() {
  await connection()

  const benchmarks = await listBenchmarks({
    benchmarksDirectory,
    scenariosDirectory,
  })

  return (
    <main>
      <h1>Benchmarks</h1>
      <ul>
        {benchmarks.map(benchmark => {
          return <li key={benchmark.id}>{benchmark.name}</li>
        })}
      </ul>
    </main>
  )
}
