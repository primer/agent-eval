import {randomUUID} from 'node:crypto'
import path from 'node:path'
import * as z from 'zod/mini'
import {getModelVariants, ModelVariantConfigSchema, type Model, type ModelVariant, type ReasoningEffort} from './model'
import {getScenario, type Scenario} from './scenario'
import type {Host} from './host'
import {ControlTreatment, TreatmentSetupSchema} from './treatment'
import type {Treatment} from './treatment'

const CapabilityConfigSchema = z.object({
  name: z.string(),
  scenarios: z.array(z.string()),
})

const BenchmarkConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  models: ModelVariantConfigSchema,
  setup: z.optional(TreatmentSetupSchema),
  capabilities: z.array(CapabilityConfigSchema),
})

type BenchmarkConfig = z.infer<typeof BenchmarkConfigSchema>

type CapabilityConfig = z.infer<typeof CapabilityConfigSchema>

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

type RunContext = {
  artifactsDirectory: string
  benchmarksDirectory: string
  host: Host
  scenariosDirectory: string
}

type Trial = {
  id: string
  capability: CapabilityConfig
  scenario: Scenario
  treatment: Treatment
  model: ModelVariant
}

type TrialRun = {}

type TrialResult = {}

async function run(context: RunContext, benchmark: Benchmark): Promise<TrialResult> {
  const trials: Array<Trial> = []

  for (const variant of getModelVariants(benchmark.models)) {
    for (const capability of benchmark.capabilities) {
      for (const scenarioId of capability.scenarios) {
        const scenario = await getScenario(context.host, context.scenariosDirectory, scenarioId)

        trials.push({
          id: randomUUID(),
          capability,
          scenario,
          treatment: ControlTreatment,
          model: variant,
        })

        trials.push({
          id: randomUUID(),
          capability,
          scenario,
          treatment: {
            name: 'Benchmark',
            setup: benchmark.setup,
          },
          model: variant,
        })
      }
    }
  }

  console.log(trials)

  throw new Error('unimplemented')
}

export {defineConfig, listBenchmarks, getBenchmark, run}
export type {BenchmarkConfig}
