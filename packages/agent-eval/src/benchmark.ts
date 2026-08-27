import {randomUUID} from 'node:crypto'
import path from 'node:path'
import * as z from 'zod/mini'
import {ModelVariantConfigSchema, type Model, type ReasoningEffort} from './model'
import type {Sandbox} from './sandbox'
import {ControlTreatment} from './experiment-config'
import type {Scenario} from './scenario'
import type {Host} from './host'

const BenchmarkConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  models: ModelVariantConfigSchema,
  capabilities: z.array(
    z.object({
      name: z.string(),
      scenarios: z.array(z.string()),
    }),
  ),
})

type BenchmarkConfig = z.infer<typeof BenchmarkConfigSchema>

type Setup = ({sandbox}: {sandbox: Sandbox}) => Promise<void>

function defineConfig(config: BenchmarkConfig): BenchmarkConfig {
  return config
}

type BenchmarkModule = {
  benchmark?: BenchmarkConfig
  default?: BenchmarkConfig
}

type Benchmark = BenchmarkConfig & {
  id: string
}

const BENCHMARK_FILE_EXTENSIONS = new Set(['.cjs', '.js', '.mjs', '.ts'])

async function listBenchmarks(host: Host, directory: string): Promise<Array<Benchmark>> {
  const stats = await host.fs.stat(directory)
  if (!stats.isDirectory()) {
    throw new Error('Expected benchmarks to be a directory')
  }

  const filenames = await host.fs.readdir(directory)
  const benchmarks: Array<Benchmark> = []

  for (const filename of filenames) {
    if (!isBenchmarkFile(filename)) {
      continue
    }

    const filepath = path.join(directory, filename)
    const mod: BenchmarkModule = await host.loadModule(filepath)
    const data = mod.benchmark ?? mod.default
    if (!data) {
      continue
    }

    const parseResult = BenchmarkConfigSchema.safeParse(data)
    if (!parseResult.success) {
      throw new Error(
        `Benchmark file must export a valid benchmark config: ${filepath}\n${z.prettifyError(parseResult.error)}`,
      )
    }

    benchmarks.push({
      id: getBenchmarkId(filename),
      ...parseResult.data,
    })
  }

  return benchmarks
}

async function getBenchmark(host: Host, directory: string, id: string): Promise<Benchmark> {
  const benchmarks = await listBenchmarks(host, directory)
  const benchmark = benchmarks.find(benchmark => benchmark.id === id)
  if (!benchmark) {
    throw new Error(`Benchmark "${id}" was not found in: ${directory}`)
  }

  return benchmark
}

function getBenchmarkId(filename: string): string {
  return path.basename(filename, path.extname(filename))
}

function isBenchmarkFile(filename: string): boolean {
  if (path.extname(filename) === '.d.ts') {
    return false
  }

  if (!BENCHMARK_FILE_EXTENSIONS.has(path.extname(filename))) {
    return false
  }

  if (path.basename(filename) === 'index') {
    return false
  }

  return true
}

type BenchmarkResult = {}

type Treatment<M extends Model> = {
  id: string
  scenario: Scenario
  config: {
    name: string
    setup?: Setup
  }
  model: Model
  reasoningEffort: ReasoningEffort<M> | null
}

type RunOptions = {
  artifactsDirectory: string
  benchmarksDirectory: string
  scenariosDirectory: string
}

async function run(config: BenchmarkConfig, options: RunOptions): Promise<BenchmarkResult> {
  const treatments = config.capabilities.flatMap(capability => {
    return config.models.flatMap(model => {
      return capability.scenarios.flatMap(scenario => {
        return [
          {
            id: randomUUID(),
            config: ControlTreatment,
            scenario,
            setup: config.setup,
            model: model.name,
            reasoningEffort: model.reasoningEfforts.length > 0 ? model.reasoningEfforts[0] : null,
          },
          {
            id: randomUUID(),
            scenario,
            config: {
              name: 'Benchmark',
              setup: config.setup,
            },
            model: model.name,
            reasoningEffort: model.reasoningEfforts.length > 0 ? model.reasoningEfforts[0] : null,
          },
        ]
      })
    })
  })
  //
}

export {defineConfig, listBenchmarks, getBenchmark, run}
export type {BenchmarkConfig}
