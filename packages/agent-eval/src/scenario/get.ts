import type {Host} from '../host'
import {listScenarios} from './list'
import type {Scenario} from './scenario'
import {getScenarioSource, type ScenarioSourceOptions} from './source'

async function getScenario(options: ScenarioSourceOptions & {id: string}): Promise<Scenario>
async function getScenario(host: Host, directory: string, id: string): Promise<Scenario>
async function getScenario(
  hostOrOptions: Host | (ScenarioSourceOptions & {id: string}),
  directory?: string,
  id?: string,
): Promise<Scenario> {
  const source = getScenarioSource(hostOrOptions, directory)
  id = id ?? (hostOrOptions as ScenarioSourceOptions & {id: string}).id
  const scenarios = await listScenarios(source)
  const scenario = scenarios.find(candidate => {
    return candidate.id === id
  })
  if (scenario) {
    return scenario
  }

  throw new Error(`Scenario "${id}" was not found in: ${source.directory}`)
}

export {getScenario}
