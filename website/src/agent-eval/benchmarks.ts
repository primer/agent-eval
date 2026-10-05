import {listBenchmarks} from '@primer/agent-eval'
import {benchmarksDirectory, scenariosDirectory} from './env'

async function list() {
  return await listBenchmarks({
    benchmarksDirectory,
    scenariosDirectory,
  })
}

async function get({id}: {id: string}) {
  const benchmarks = await list()
  const benchmark = benchmarks.find(benchmark => {
    return benchmark.id === id
  })
  if (benchmark) {
    return benchmark
  }

  throw new Error(`Benchmark with id ${id} not found`)
}

export {list, get}
