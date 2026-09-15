import {randomUUID} from 'node:crypto'
import * as z from 'zod/mini'
import {createPlan} from '../plan'
import type {Plan} from '../plan'
import {ControlTreatment, createTreatment} from '../treatment'
import type {Trial} from '../trial/trial'
import type {Benchmark, Capability} from './benchmark'
import type {Shard} from '../shard'
import {ModelVariantSchema} from '../model'

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

const BenchmarkPlanManifestFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  trials: z.array(
    z.object({
      capabilityId: z.string(),
      id: z.string(),
      model: ModelVariantSchema,
      scenarioId: z.string(),
      treatmentId: z.string(),
    }),
  ),
})

type BenchmarkPlanManifestFile = z.infer<typeof BenchmarkPlanManifestFileSchema>

type CreateBenchmarkPlanManifestOptions = {
  benchmark: Benchmark
  plan: Plan<BenchmarkTrial>
}

function createBenchmarkPlanManifest({benchmark, plan}: CreateBenchmarkPlanManifestOptions): BenchmarkPlanManifestFile {
  const file: BenchmarkPlanManifestFile = {
    id: benchmark.id,
    name: benchmark.name,
    trials: plan.trials.map(trial => {
      return {
        capabilityId: trial.capability.id,
        id: trial.id,
        model: trial.model,
        scenarioId: trial.scenario.id,
        treatmentId: trial.treatment.id,
      }
    }),
  }

  return file
}

type BenchmarkPlanManifest = {
  trials: Array<BenchmarkTrial>
}

type CreateBenchmarkPlanFromManifestOptions = {
  manifest: BenchmarkPlanManifest
  shard?: Shard
}

function createBenchmarkPlanFromManifest({
  manifest,
  shard,
}: CreateBenchmarkPlanFromManifestOptions): Plan<BenchmarkTrial> {
  throw new Error('unimplemented')
}

function parseBenchmarkPlanManifest(contents: string): BenchmarkPlanManifest {
  throw new Error('unimplemented')
}

export {createBenchmarkPlan, createBenchmarkPlanManifest, createBenchmarkPlanFromManifest, parseBenchmarkPlanManifest}
export type {BenchmarkTrial}
