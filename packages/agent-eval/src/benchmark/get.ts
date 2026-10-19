import path from 'node:path'
import {DefaultHost, type Host} from '../host'
import type {Benchmark} from './benchmark'
import {listBenchmarks} from './list'
import {findResource} from '../resource'

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

  id: string
}

type GetBenchmarkByNameOptions = Omit<GetBenchmarkOptions, 'id'> & {
  name: string
}

type GetBenchmarkByReferenceOptions = Omit<GetBenchmarkOptions, 'id'> & {
  reference: string
}

async function getBenchmark({id, ...options}: GetBenchmarkOptions): Promise<Benchmark> {
  return findBenchmark(options, id, candidate => {
    return candidate.id === id
  })
}

async function getBenchmarkByName({name, ...options}: GetBenchmarkByNameOptions): Promise<Benchmark> {
  return findBenchmark(options, name, candidate => {
    return candidate.name === name
  })
}

async function getBenchmarkByReference({reference, ...options}: GetBenchmarkByReferenceOptions): Promise<Benchmark> {
  return findBenchmark(options, reference, candidate => {
    const filename = path.basename(candidate.filepath, path.extname(candidate.filepath))
    return candidate.id === reference || candidate.name === reference || filename === reference
  })
}

async function findBenchmark(
  {benchmarksDirectory, host = DefaultHost, scenariosDirectory}: Omit<GetBenchmarkOptions, 'id'>,
  identifier: string,
  matches: (benchmark: Benchmark) => boolean,
): Promise<Benchmark> {
  const benchmarks = await listBenchmarks({
    host,
    benchmarksDirectory,
    scenariosDirectory,
  })
  return findResource(benchmarks, matches, `Benchmark "${identifier}"`, benchmarksDirectory)
}

export {getBenchmark, getBenchmarkByName, getBenchmarkByReference}
