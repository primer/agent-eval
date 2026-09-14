import {randomUUID} from 'node:crypto'
import {createPlan, runPlan} from '../plan'
import type {Plan, RunPlanResult} from '../plan'
import {ControlTreatment, createTreatment} from '../treatment'
import type {Trial} from '../trial/trial'
import type {Benchmark, Capability} from './benchmark'
import type {Host} from '../host'

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

type RunBenchmarkPlanOptions = {
  artifactsDirectory: string
  concurrency: number
  copilotToken: string
  dockerImage: string
  host?: Host
  plan: Plan<BenchmarkTrial>
}

async function runBenchmarkPlan({
  artifactsDirectory,
  concurrency,
  copilotToken,
  dockerImage,
  host,
  plan,
}: RunBenchmarkPlanOptions): Promise<RunPlanResult<BenchmarkTrial>> {
  const results = await runPlan({
    artifactsDirectory,
    concurrency,
    copilotToken,
    dockerImage,
    host,
    plan,
  })

  console.log(results)

  throw new Error('unimplemented')
}

export {createBenchmarkPlan, runBenchmarkPlan}

// import * as z from 'zod/mini'

// const BenchmarkPlanConfigSchema = z.extend(PlanConfigSchema, {
//   source: z.extend(PlanConfigSourceSchema, {
//     id: z.string(),
//   }),
//   trials: z.array(
//     z.extend(PlanConfigTrialSchema, {
//       capabilityId: z.string(),
//     }),
//   ),
// })

// import {randomUUID} from 'node:crypto'
// import type {Benchmark} from './benchmark'
// // import {create as createPlan, run as runPlan, PlanSchema, PlanSourceSchema, TrialPlanSchema} from '../plan'
// import {ControlTreatment, create as createTreatment} from '../treatment'
// import type {Host} from '../host'
// import {createPlan, PlanConfigSchema, PlanConfigSourceSchema, PlanConfigTrialSchema} from '../plan'
// import type {Trial} from '../trial/trial'
//
// const BenchmarkPlanConfigSchema = z.extend(PlanConfigSchema, {
//   source: z.extend(PlanConfigSourceSchema, {
//     id: z.string(),
//   }),
//   trials: z.array(
//     z.extend(PlanConfigTrialSchema, {
//       capabilityId: z.string(),
//     }),
//   ),
// })
//
// type BenchmarkPlanConfig = z.infer<typeof BenchmarkPlanConfigSchema>
//
// type CreateBenchmarkPlanOptions = {
//   benchmark: Benchmark
// }
//
// type BenchmarkPlan = {
//   trials: Array<Trial>
// }
//
// function createBenchmarkPlan({benchmark}: CreateBenchmarkPlanOptions): BenchmarkPlan {
//   throw new Error('unimplemented')
//   // const treatments = [
//   //   ControlTreatment,
//   //   createTreatment({
//   //     name: 'Benchmark',
//   //     setup: benchmark.setup,
//   //   }),
//   // ]
//   //
//   // return createPlan({
//   //   trials: benchmark.models.flatMap(model => {
//   //     return benchmark.capabilities.flatMap(capability => {
//   //       return capability.scenarios.flatMap(scenario => {
//   //         return treatments.map(treatment => {
//   //           return {
//   //             id: randomUUID(),
//   //             scenario,
//   //             treatment,
//   //             model,
//   //             capability,
//   //           }
//   //         })
//   //       })
//   //     })
//   //   }),
//   // })
// }
//
// export {createBenchmarkPlan}
//
// // function serialize(plan: BenchmarkPlanConfig): string {
// //   return JSON.stringify(plan, null, 2)
// // }
// //
// // function deserialize(contents: string): BenchmarkPlanConfig {
// //   const parsed = JSON.parse(contents)
// //   return BenchmarkPlanConfigSchema.parse(parsed)
// // }
// //
// // function parse(input: unknown): BenchmarkPlanConfig {
// //   return BenchmarkPlanConfigSchema.parse(input)
// // }
// //
// // function create(benchmark: Benchmark): BenchmarkPlanConfig {
// //   const treatments = [
// //     ControlTreatment,
// //     createTreatment({
// //       name: 'Benchmark',
// //       setup: benchmark.setup,
// //     }),
// //   ]
// //
// //   return createPlan({
// //     source: {
// //       type: 'benchmark',
// //       id: benchmark.id,
// //     },
// //     trials: benchmark.models.flatMap(model => {
// //       return benchmark.capabilities.flatMap(capability => {
// //         return capability.scenarios.flatMap(scenario => {
// //           return treatments.map(treatment => {
// //             return {
// //               id: randomUUID(),
// //               scenarioId: scenario.id,
// //               treatmentId: treatment.id,
// //               model,
// //               capabilityId: capability.id, }
// //           })
// //         })
// //       })
// //     }),
// //   })
// // }
// //
// // type RunBenchmarkPlanOptions = {
// //   concurrency: number
// //   dockerImage: string
// //   host?: Host
// //   plan: BenchmarkPlanConfig
// // }
// //
// // type RunBenchmarkPlanResult = {}
// //
// // async function run({concurrency, dockerImage, host, plan}: RunBenchmarkPlanOptions): Promise<RunBenchmarkPlanResult> {
// //   // await runPlan({
// //   //   concurrency,
// //   //   dockerImage,
// //   //   host,
// //   //   plan,
// //   // })
// //   throw new Error('unimplemented')
// // }
// //
// // function merge() {
// //   throw new Error('unimplemented')
// // }
// //
// // export {BenchmarkPlanConfigSchema as BenchmarkPlanSchema, serialize, deserialize, parse, create, run, merge}
// // export type {BenchmarkPlanConfig as BenchmarkPlan}
