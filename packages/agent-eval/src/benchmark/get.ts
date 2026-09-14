import {DefaultHost, type Host} from '../host'
import type {Benchmark} from './benchmark'
import {list} from './list'

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

  /**
   * The name of the benchmark, corresponds to the filename without the
   * extension
   */
  name: string
}

/**
 * Get a benchmark by name
 */
async function get({
  benchmarksDirectory,
  host = DefaultHost,
  name,
  scenariosDirectory,
}: GetBenchmarkOptions): Promise<Benchmark> {
  const benchmarks = await list({
    host,
    benchmarksDirectory,
    scenariosDirectory,
  })
  const benchmark = benchmarks.find(candidate => candidate.id === name)
  if (benchmark) {
    return benchmark
  }

  throw new Error(`Benchmark "${name}" was not found in: ${benchmarksDirectory}`)
}

export {get}
