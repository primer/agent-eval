import * as z from 'zod/mini'
import type {Experiment} from './experiment'

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

function getExperimentBenchmark(experiment: Experiment): ExperimentBenchmark | undefined {
  if (!experiment.benchmark) {
    return undefined
  }
  return {
    id: experiment.benchmark.id,
    name: experiment.benchmark.name,
    capabilities: Object.fromEntries(
      experiment.benchmark.capabilities.map(capability => {
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

export {ExperimentBenchmarkSchema, getExperimentBenchmark}
export type {ExperimentBenchmark}
