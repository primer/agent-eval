import {existsSync} from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import type {BenchmarkConfig} from './experiment-config'

type BenchmarkModule = {
  benchmark?: BenchmarkConfig
  default?: BenchmarkConfig
}

type BenchmarkSourceOptions = {
  directory?: string
}

type LoadBenchmarkOptions = BenchmarkSourceOptions & {
  benchmark?: string
}

const BENCHMARK_FILE_EXTENSIONS = new Set(['.cjs', '.js', '.mjs', '.ts'])

function getBenchmarkId(filename: string): string {
  return filename.replace(/\.(?:cjs|js|mjs|ts)$/, '')
}

function isBenchmarkFile(filename: string): boolean {
  if (filename.endsWith('.d.ts')) {
    return false
  }

  return filename !== 'index.ts' && BENCHMARK_FILE_EXTENSIONS.has(path.extname(filename))
}

async function loadBenchmarkFile(filepath: string): Promise<BenchmarkConfig> {
  const resolvedPath = path.resolve(filepath)
  const mod = (await import(pathToFileURL(resolvedPath).href)) as BenchmarkModule
  const benchmark = mod.benchmark ?? mod.default
  if (!benchmark) {
    throw new Error(`Benchmark file must export "benchmark" or a default export: ${resolvedPath}`)
  }

  return benchmark
}

async function getBenchmarkEntries(sourceDirectory: string): Promise<Array<[string, BenchmarkConfig]>> {
  const directory = path.resolve(sourceDirectory)
  if (!existsSync(directory)) {
    throw new Error(`Benchmarks directory does not exist: ${directory}`)
  }

  const stats = await fs.stat(directory)
  if (!stats.isDirectory()) {
    throw new Error(`Benchmarks path is not a directory: ${directory}`)
  }

  const filenames = (await fs.readdir(directory)).toSorted()
  return Promise.all(
    filenames.filter(isBenchmarkFile).map(async filename => {
      const filepath = path.join(directory, filename)
      return [getBenchmarkId(filename), await loadBenchmarkFile(filepath)]
    }),
  )
}

async function listBenchmarks(options: BenchmarkSourceOptions = {}): Promise<Array<[string, BenchmarkConfig]>> {
  return getBenchmarkEntries(options.directory ?? 'benchmarks')
}

async function findBenchmark(
  id: string,
  options: BenchmarkSourceOptions = {},
): Promise<BenchmarkConfig | undefined> {
  if (existsSync(id)) {
    return loadBenchmarkFile(id)
  }

  const benchmarks = await getBenchmarkEntries(options.directory ?? 'benchmarks')
  return benchmarks.find(([name]) => name === id)?.[1]
}

async function loadBenchmarkConfigs(options: LoadBenchmarkOptions = {}): Promise<Array<BenchmarkConfig>> {
  if (options.benchmark) {
    const benchmark = await findBenchmark(options.benchmark, options)
    return benchmark ? [benchmark] : []
  }

  return (await listBenchmarks(options)).map(([, benchmark]) => benchmark)
}

export {findBenchmark, listBenchmarks, loadBenchmarkConfigs}
export type {BenchmarkSourceOptions, LoadBenchmarkOptions}
