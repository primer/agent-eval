import path from 'node:path'
import type {Benchmark as AgentEvalBenchmark} from '@primer/agent-eval/benchmark'

const {getBenchmark, listBenchmarks} = await import(
  /* turbopackIgnore: true */
  '@primer/agent-eval/benchmark'
)

const BENCHMARKS_DIR = path.resolve(process.cwd(), '..', 'benchmarks')
const SCENARIOS_DIR = path.resolve(process.cwd(), '..', 'scenarios')

export type Benchmark = Pick<AgentEvalBenchmark, 'id' | 'name' | 'description' | 'models'> & {
  capabilities: Array<{
    name: string
    scenarios: Array<{id: string}>
  }>
}

function normalizeBenchmark(benchmark: AgentEvalBenchmark): Benchmark {
  return {
    id: benchmark.id,
    name: benchmark.name,
    description: benchmark.description,
    models: benchmark.models,
    capabilities: benchmark.capabilities.map(capability => {
      return {
        name: capability.name,
        scenarios: capability.scenarios.map(scenario => {
          return {id: scenario.id}
        }),
      }
    }),
  }
}

export async function list(): Promise<Array<Benchmark>> {
  const benchmarks = await listBenchmarks({
    benchmarksDirectory: BENCHMARKS_DIR,
    scenariosDirectory: SCENARIOS_DIR,
  })

  return benchmarks.map(normalizeBenchmark)
}

export async function get(id: string): Promise<Benchmark> {
  const benchmark = await getBenchmark({
    benchmarksDirectory: BENCHMARKS_DIR,
    scenariosDirectory: SCENARIOS_DIR,
    id,
  })

  return normalizeBenchmark(benchmark)
}
