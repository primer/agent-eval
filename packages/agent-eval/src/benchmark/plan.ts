import {randomUUID} from 'node:crypto'
import * as z from 'zod/mini'
import {createPlan} from '../plan'
import type {Plan} from '../plan'
import {ControlTreatment, createTreatment} from '../treatment'
import type {Trial} from '../trial/trial'
import type {Benchmark, Capability} from './benchmark'
import {ModelVariantSchema} from '../model'
import type {Host} from '../host'
import {getBenchmark} from './get'

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
              setup: capability.setup,
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
  benchmark: Benchmark
  trials: Array<BenchmarkTrial>
}

type ParseBenchmarkPlanManifestOptions = {
  benchmarksDirectory: string
  contents: string
  host?: Host
  scenariosDirectory: string
}

async function parseBenchmarkPlanManifest({
  benchmarksDirectory,
  contents,
  host,
  scenariosDirectory,
}: ParseBenchmarkPlanManifestOptions): Promise<BenchmarkPlanManifest> {
  const result = BenchmarkPlanManifestFileSchema.parse(JSON.parse(contents))
  const benchmark = await getBenchmark({
    benchmarksDirectory,
    host,
    name: result.id,
    scenariosDirectory,
  })
  const capabilities = new Map(
    benchmark.capabilities.map(capability => {
      return [capability.id, capability]
    }),
  )
  const treatments = new Map(
    [ControlTreatment, createTreatment({name: 'Benchmark', setup: benchmark.setup})].map(treatment => {
      return [treatment.id, treatment]
    }),
  )
  const trialIds = new Set<string>()

  return {
    benchmark,
    trials: result.trials.map(trial => {
      if (trialIds.has(trial.id)) {
        throw new Error(`Duplicate trial ID in benchmark plan: ${trial.id}`)
      }
      trialIds.add(trial.id)

      const capability = capabilities.get(trial.capabilityId)
      if (!capability) {
        throw new Error(`Capability not found for trial: ${trial.id}`)
      }

      const scenario = capability.scenarios.find(candidate => {
        return candidate.id === trial.scenarioId
      })
      if (!scenario) {
        throw new Error(
          `Scenario "${trial.scenarioId}" does not belong to capability "${capability.id}" for trial "${trial.id}"`,
        )
      }

      const treatment = treatments.get(trial.treatmentId)
      if (!treatment) {
        throw new Error(`Treatment not found for trial: ${trial.id}`)
      }

      const model = benchmark.models.find(candidate => {
        return candidate.name === trial.model.name && candidate.reasoningEffort === trial.model.reasoningEffort
      })
      if (!model) {
        throw new Error(`Model variant not found for trial: ${trial.id}`)
      }

      return {
        id: trial.id,
        capability,
        model,
        scenario,
        treatment,
        setup: capability.setup,
      }
    }),
  }
}

export {createBenchmarkPlan, createBenchmarkPlanManifest, parseBenchmarkPlanManifest}
export type {BenchmarkTrial}
