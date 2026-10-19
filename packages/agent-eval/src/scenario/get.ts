import path from 'node:path'
import {DefaultHost, type Host} from '../host'
import {findResource} from '../resource'
import {listScenarios} from './list'
import type {Scenario} from './scenario'

type GetScenarioOptions = {
  directory: string
  host?: Host
  id: string
}

type GetScenarioByNameOptions = Omit<GetScenarioOptions, 'id'> & {
  name: string
}

type GetScenarioByReferenceOptions = Omit<GetScenarioOptions, 'id'> & {
  reference: string
}

async function getScenario({id, ...options}: GetScenarioOptions): Promise<Scenario> {
  return findScenario(options, id, candidate => {
    return candidate.id === id
  })
}

async function getScenarioByName({name, ...options}: GetScenarioByNameOptions): Promise<Scenario> {
  return findScenario(options, name, candidate => {
    return candidate.name === name
  })
}

async function getScenarioByReference({reference, ...options}: GetScenarioByReferenceOptions): Promise<Scenario> {
  return findScenario(options, reference, candidate => {
    return (
      candidate.id === reference || candidate.name === reference || path.basename(candidate.directory) === reference
    )
  })
}

async function findScenario(
  {directory, host = DefaultHost}: Omit<GetScenarioOptions, 'id'>,
  identifier: string,
  matches: (scenario: Scenario) => boolean,
): Promise<Scenario> {
  const scenarios = await listScenarios({directory, host})
  return findResource(scenarios, matches, `Scenario "${identifier}"`, directory)
}

export {getScenario, getScenarioByName, getScenarioByReference}
