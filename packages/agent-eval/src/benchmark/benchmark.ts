import type {BenchmarkConfig} from './config'
import {type ModelVariant} from '../model'
import type {Scenario} from '../scenario'
import type {TreatmentSetup} from '../treatment'
import {hash} from '../hash'

type Capability = {
  id: string
  name: string
  scenarios: Array<Scenario>
  setup?: TreatmentSetup
}

type Benchmark = {
  id: string
  filepath: string
  name: BenchmarkConfig['name']
  description: BenchmarkConfig['description']
  models: Array<ModelVariant>
  setup?: TreatmentSetup
  capabilities: Array<Capability>
}

function getBenchmarkId(name: string): string {
  return hash(`Benchmark:${name}`)
}

function getCapabilityId(name: string): string {
  return hash(`Capability:${name}`)
}

export {getBenchmarkId, getCapabilityId}
export type {Benchmark, Capability}
