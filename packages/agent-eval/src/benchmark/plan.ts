import {randomUUID} from 'node:crypto'
import {createPlan} from '../plan'
import type {Plan, RunPlanResult} from '../plan'
import {ControlTreatment, createTreatment} from '../treatment'
import type {Trial} from '../trial/trial'
import type {Benchmark, Capability} from './benchmark'

type CreateBenchmarkPlanOptions = {
  benchmark: Benchmark
}

type BenchmarkTrial = Trial & {
  capability: Capability
}

/**
 * Create a new Plan for a given Benchmark. This will set up trials based on a
 * combination of model, capability, scenario, and treatment (benchmark or
 * control).
 */
function createBenchmarkPlan({benchmark}: CreateBenchmarkPlanOptions): Plan<BenchmarkTrial> {
  const treatments = [
    ControlTreatment,
    createTreatment({
      name: 'Benchmark',
      setup: benchmark.setup,
    }),
  ]

  return createPlan({
    trials: benchmark.models.flatMap(model => {
      return benchmark.capabilities.flatMap(capability => {
        return capability.scenarios.flatMap(scenario => {
          return treatments.map(treatment => {
            return {
              id: randomUUID(),
              scenario,
              treatment,
              model,
              capability,
            }
          })
        })
      })
    }),
  })
}

export {createBenchmarkPlan}
export type {BenchmarkTrial}
