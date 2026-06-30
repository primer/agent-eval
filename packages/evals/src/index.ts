import {data} from './generated/evals'
import type {EvalId, Eval} from './generated/evals'

function list(): ReadonlyArray<Eval> {
  return data
}

function get(id: EvalId): Eval {
  const result = data.find(e => e.id === id)
  if (result) {
    return result
  }
  throw new Error(`Eval with id ${id} not found`)
}

export {list, get}
export type {EvalId, Eval}
