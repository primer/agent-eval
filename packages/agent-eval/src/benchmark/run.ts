import {randomUUID} from 'node:crypto'
import type {Benchmark, Capability} from './benchmark'
import type {Host} from '../host'
// import {run as runPlan} from './plan'
import {run} from '../run'
import {ControlTreatment, createTreatment} from '../treatment'
import {logger} from '../logger'
import type {Trial, TrialResult} from '../trial/trial'
// import type {BenchmarkPlan} from './plan'
// import type {TrialResult} from '../trial'

type RunBenchmarkOptions = {
  artifactsDirectory: string
  benchmark: Benchmark
  concurrency: number
  copilotToken: string
  dockerImage: string
  host?: Host
}

type BenchmarkTrialResult = TrialResult & {
  capability: Capability
}

type BenchmarkRunResult = {
  trials: Array<BenchmarkTrialResult>
}

async function runBenchmark({
  artifactsDirectory,
  benchmark,
  concurrency,
  copilotToken,
  dockerImage,
  host,
}: RunBenchmarkOptions): Promise<BenchmarkRunResult> {
  const treatments = [
    ControlTreatment,
    createTreatment({
      name: 'Benchmark',
      setup: benchmark.setup,
    }),
  ]
  const trials = benchmark.models.flatMap(model => {
    return benchmark.capabilities.flatMap(capability => {
      return capability.scenarios.flatMap(scenario => {
        return treatments.map(treatment => {
          const trial: Trial = {
            id: randomUUID(),
            scenario,
            treatment,
            model,
          }
          return [capability, trial] as const
        })
      })
    })
  })

  const results = await run({
    artifactsDirectory,
    concurrency,
    copilotToken,
    dockerImage,
    host,
    trials: trials.map(([_, trial]) => trial),
  })

  // return {
  // }
}

export {runBenchmark}
