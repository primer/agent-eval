import path from 'node:path'
import {getCapabilityId, type Benchmark} from './benchmark'
import {BenchmarkConfigSchema} from './config'
import {DefaultHost, type Host} from '../host'
import {logger} from '../logger'
import {getModelVariants} from '../model'
import {getScenario} from '../scenario'
import {prettifyError} from 'zod/mini'

const BENCHMARK_FILE_EXTENSIONS = new Set(['.cjs', '.js', '.mjs', '.ts'])

type BenchmarkModule = {
  benchmark?: unknown
  default?: unknown
}

type ListBenchmarksOptions = {
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
}

async function list({
  benchmarksDirectory,
  host = DefaultHost,
  scenariosDirectory,
}: ListBenchmarksOptions): Promise<Array<Benchmark>> {
  if (!host.existsSync(benchmarksDirectory)) {
    throw new Error(`Benchmarks directory does not exist: ${benchmarksDirectory}`)
  }

  const stats = await host.fs.stat(benchmarksDirectory)
  if (!stats.isDirectory()) {
    throw new Error(`Benchmarks path is not a directory: ${benchmarksDirectory}`)
  }

  const filenames = (await host.fs.readdir(benchmarksDirectory)).sort()
  const benchmarks: Array<Benchmark> = []

  for (const filename of filenames) {
    if (!isBenchmarkFile(filename)) {
      continue
    }

    const filepath = path.join(benchmarksDirectory, filename)
    const mod: BenchmarkModule = await host.loadModule(filepath)
    const data = mod.benchmark ?? mod.default
    if (!data) {
      continue
    }

    const parseResult = BenchmarkConfigSchema.safeParse(data)
    if (!parseResult.success) {
      logger.warn(`Failed to parse benchmark config for file: ${filepath}. Error: ${prettifyError(parseResult.error)}`)
      continue
    }

    const {data: config} = parseResult
    const capabilities = await Promise.all(
      config.capabilities.map(async capability => {
        const scenarios = await Promise.all(
          capability.scenarios.map(scenario => {
            return getScenario(host, scenariosDirectory, scenario)
          }),
        )

        return {
          id: getCapabilityId(capability.name),
          name: capability.name,
          scenarios,
          setup: capability.setup,
        }
      }),
    )

    benchmarks.push({
      id: getBenchmarkId(filename),
      filepath,
      name: config.name,
      description: config.description,
      models: getModelVariants(config.models),
      setup: config.setup,
      capabilities,
    })
  }

  return benchmarks
}

function getBenchmarkId(filename: string): string {
  return path.basename(filename, path.extname(filename))
}

function isBenchmarkFile(filename: string): boolean {
  return !filename.endsWith('.d.ts') && filename !== 'index.ts' && BENCHMARK_FILE_EXTENSIONS.has(path.extname(filename))
}

export {list}
