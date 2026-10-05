import {DefaultHost, type Host} from '../host'
import type {Benchmark} from './benchmark'
import {listBenchmarks} from './list'

type GetBenchmarkOptions = {
  /**
   * The directory where benchmark are located
   */
  benchmarksDirectory: string

  /**
   * The host to use for file system operations and module loading
   */
  host?: Host

  /**
   * The directory where scenario are located
   */
  scenariosDirectory: string
} & ({id: string; name?: never} | {id?: never; name: string})

/**
 * Get a benchmark by name or ID
 */
async function getBenchmark(options: GetBenchmarkOptions): Promise<Benchmark> {
  const {benchmarksDirectory, host = DefaultHost, scenariosDirectory} = options
  const benchmarks = await listBenchmarks({
    host,
    benchmarksDirectory,
    scenariosDirectory,
  })
  const identifier = options.id ?? options.name
  const benchmark =
    options.id === undefined
      ? (benchmarks.find(candidate => candidate.id === options.name) ??
        benchmarks.find(candidate => candidate.name === options.name))
      : benchmarks.find(candidate => candidate.id === options.id)
  if (benchmark) {
    return benchmark
  }

  throw new Error(`Benchmark "${identifier}" was not found in: ${benchmarksDirectory}`)
}

export {getBenchmark}
