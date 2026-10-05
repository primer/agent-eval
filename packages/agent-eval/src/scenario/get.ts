import {DefaultHost, type Host} from '../host'
import {listScenarios} from './list'
import {getScenarioId, type Scenario} from './scenario'

type ScenarioDirectory = {
  directory: string
  host?: Host
}

type GetScenarioOptions = ScenarioDirectory & {
  id: string
}

type GetScenarioByNameOptions = ScenarioDirectory & {
  name: string
}

async function getScenario({directory, host = DefaultHost, id}: GetScenarioOptions): Promise<Scenario> {
  const scenarios = await listScenarios({directory, host})
  const scenario = scenarios.find(candidate => candidate.id === id)
  if (scenario) {
    return scenario
  }

  throw new Error(`Scenario with ID "${id}" was not found in: ${directory}`)
}

async function getScenarioByName({directory, host = DefaultHost, name}: GetScenarioByNameOptions): Promise<Scenario> {
  const scenarios = await listScenarios({directory, host})
  const id = getScenarioId(name)
  const scenario = scenarios.find(candidate => candidate.id === id)
  if (scenario) {
    return scenario
  }

  throw new Error(`Scenario "${name}" was not found in: ${directory}`)
}

export {getScenario, getScenarioByName}
