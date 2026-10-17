import {DefaultHost, type Host} from '../host'
import {listScenarios} from './list'
import type {Scenario} from './scenario'

type GetScenarioOptions = {
  directory: string
  host?: Host
  name: string
}

async function getScenario({directory, host = DefaultHost, name}: GetScenarioOptions): Promise<Scenario> {
  const scenarios = await listScenarios({directory, host})
  const scenario = scenarios.find(candidate => {
    return candidate.id === name
  })
  if (scenario) {
    return scenario
  }

  throw new Error(`Scenario "${name}" was not found in: ${directory}`)
}

export {getScenario}
