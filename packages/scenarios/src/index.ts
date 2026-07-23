import {data} from './generated/scenarios'
import type {Scenario, ScenarioId} from './generated/scenarios'

function list(): ReadonlyArray<Scenario> {
  return data
}

function get(id: ScenarioId): Scenario {
  const result = data.find(e => e.id === id)
  if (result) {
    return result
  }
  throw new Error(`Scenario with id ${id} not found`)
}

export {list, get}
export type {Scenario, ScenarioId}
