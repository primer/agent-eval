import fs from 'node:fs/promises'
import path from 'node:path'
// import * as z from 'zod/mini'
import type {Model, ModelConfig, ReasoningEffort} from './model'
import type {Sandbox} from './sandbox'
import {ControlTreatment, type TreatmentConfig} from './experiment-config'
import {getScenario} from './scenario'
import type {Scenario} from './scenario'
import {randomUUID} from 'node:crypto'

// const BenchmarkConfigSchema = z.object({
//   name: z.string(),
//   description: z.string(),
//   capabilities: z.array(
//     z.object({
//       name: z.string(),
//       scenarios: z.array(z.string()),
//     }),
//   ),
// })

type BenchmarkConfig = {
  name: string
  description: string
  models: Array<ModelConfig>
  setup: Setup
  capabilities: Array<{
    name: string
    scenarios: Array<string>
  }>
}

type Setup = ({sandbox}: {sandbox: Sandbox}) => Promise<void>

function defineConfig(config: BenchmarkConfig): BenchmarkConfig {
  return config
}

type BenchmarkModule = {
  benchmark: BenchmarkConfig
}

const BENCHMARK_FILE_EXTENSIONS = new Set(['.cjs', '.js', '.mjs', '.ts'])

async function listBenchmarks(directory: string) {
  const stats = await fs.stat(directory)
  if (!stats.isDirectory()) {
    throw new Error('Expected benchmarks to be a directory')
  }

  const filenames = await fs.readdir(directory)
  const benchmarks = await Promise.all(
    filenames
      .filter(filename => {
        return isBenchmarkFile(filename)
      })
      .map(async filename => {
        const filepath = path.join(directory, filename)
        const mod: BenchmarkModule = await import(filepath)
        if (!mod.benchmark) {
          throw new Error(`Benchmark file must export "benchmark": ${filepath}`)
        }
        return [getBenchmarkId(filename), mod.benchmark] as const
      }),
  )

  return benchmarks
}

async function getBenchmark(directory: string, id: string): Promise<BenchmarkConfig> {
  const benchmarks = await listBenchmarks(directory)
  const benchmark = benchmarks.find(([benchmarkId]) => benchmarkId === id)
  if (!benchmark) {
    throw new Error(`Benchmark "${id}" was not found in: ${directory}`)
  }

  return benchmark[1]
}

function getBenchmarkId(filename: string): string {
  return path.basename(filename)
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

type Treatment = {
  id: string
  scenario: Scenario
  config: {
    name: string
    setup?: Setup
  }
  model: Model
  reasoningEffort: ReasoningEffort | null
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
