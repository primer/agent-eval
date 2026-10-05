import {DefaultHost, type Host} from '../host'
import {getBenchmarkId, type Benchmark} from './benchmark'
import {listBenchmarks} from './list'

type BenchmarkDirectories = {
  benchmarksDirectory: string
  host?: Host
  scenariosDirectory: string
}

type GetBenchmarkOptions = BenchmarkDirectories & {
  id: string
}

type GetBenchmarkByNameOptions = BenchmarkDirectories & {
  name: string
}

async function getBenchmark({
  benchmarksDirectory,
  host = DefaultHost,
  id,
  scenariosDirectory,
}: GetBenchmarkOptions): Promise<Benchmark> {
  const benchmarks = await listBenchmarks({benchmarksDirectory, host, scenariosDirectory})
  const benchmark = benchmarks.find(candidate => candidate.id === id)
  if (benchmark) {
    return benchmark
  }

  throw new Error(`Benchmark with ID "${id}" was not found in: ${benchmarksDirectory}`)
}

async function getBenchmarkByName({
  benchmarksDirectory,
  host = DefaultHost,
  name,
  scenariosDirectory,
}: GetBenchmarkByNameOptions): Promise<Benchmark> {
  const benchmarks = await listBenchmarks({benchmarksDirectory, host, scenariosDirectory})
  const id = getBenchmarkId(name)
  const benchmark = benchmarks.find(candidate => candidate.id === id)
  if (benchmark) {
    return benchmark
  }

  throw new Error(`Benchmark "${name}" was not found in: ${benchmarksDirectory}`)
}

export {getBenchmark, getBenchmarkByName}
