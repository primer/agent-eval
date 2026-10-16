import {listBenchmarks} from '@primer/agent-eval'
import {benchmarksDirectory, scenariosDirectory} from '../env'

export default async function IndexPage() {
  const benchmarks = await listBenchmarks({
    benchmarksDirectory,
    scenariosDirectory,
  })
  console.log(benchmarks)
  return 'hello world: ' + benchmarksDirectory
}
