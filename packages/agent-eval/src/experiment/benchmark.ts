import * as z from 'zod/mini'
import type {Benchmark} from '../benchmark/benchmark'

const ExperimentBenchmarkSchema = z.object({
  id: z.string(),
  name: z.string(),
  capabilities: z.record(
    z.string(),
    z.object({
      id: z.string(),
      name: z.string(),
      scenarioIds: z.array(z.string()),
    }),
  ),
})

type ExperimentBenchmark = z.infer<typeof ExperimentBenchmarkSchema>

function createExperimentBenchmark(benchmark: Benchmark): ExperimentBenchmark {
  return {
    id: benchmark.id,
    name: benchmark.name,
    capabilities: Object.fromEntries(
      benchmark.capabilities.map(capability => {
        return [
          capability.id,
          {
            id: capability.id,
            name: capability.name,
            scenarioIds: capability.scenarios.map(scenario => {
              return scenario.id
            }),
          },
        ]
      }),
    ),
  }
}

export {ExperimentBenchmarkSchema, createExperimentBenchmark}
export type {ExperimentBenchmark}
