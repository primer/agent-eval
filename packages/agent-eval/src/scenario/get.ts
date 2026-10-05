import {DefaultHost, type Host} from '../host'
import {listScenarios} from './list'
import type {Scenario} from './scenario'

type GetScenarioOptions = {
  directory: string
  host?: Host
} & ({id: string; name?: never} | {id?: never; name: string})

async function getScenario(options: GetScenarioOptions): Promise<Scenario> {
  const {directory, host = DefaultHost} = options
  const scenarios = await listScenarios({directory, host})
  const identifier = options.id ?? options.name
  const scenario = scenarios.find(candidate => {
    return candidate.id === identifier
  })
  if (scenario) {
    return scenario
  }

  throw new Error(`Scenario "${identifier}" was not found in: ${directory}`)
}

export {getScenario}
