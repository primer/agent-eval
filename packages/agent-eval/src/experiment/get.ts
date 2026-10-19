import path from 'node:path'
import {DefaultHost, type Host} from '../host'
import type {Experiment} from './experiment'
import {listExperiments} from './list'
import {findResource} from '../resource'

type GetExperimentOptions = {
  benchmarksDirectory: string
  experimentsDirectory: string
  host?: Host
  scenariosDirectory: string
  id: string
}

type GetExperimentByNameOptions = Omit<GetExperimentOptions, 'id'> & {
  name: string
}

type GetExperimentByReferenceOptions = Omit<GetExperimentOptions, 'id'> & {
  reference: string
}

async function getExperiment({id, ...options}: GetExperimentOptions): Promise<Experiment> {
  return findExperiment(options, id, candidate => {
    return candidate.id === id
  })
}

async function getExperimentByName({name, ...options}: GetExperimentByNameOptions): Promise<Experiment> {
  return findExperiment(options, name, candidate => {
    return candidate.name === name
  })
}

async function getExperimentByReference({reference, ...options}: GetExperimentByReferenceOptions): Promise<Experiment> {
  return findExperiment(options, reference, candidate => {
    const filename = path.basename(candidate.filepath, path.extname(candidate.filepath))
    return candidate.id === reference || candidate.name === reference || filename === reference
  })
}

async function findExperiment(
  {benchmarksDirectory, experimentsDirectory, host = DefaultHost, scenariosDirectory}: Omit<GetExperimentOptions, 'id'>,
  identifier: string,
  matches: (experiment: Experiment) => boolean,
): Promise<Experiment> {
  const experiments = await listExperiments({
    benchmarksDirectory,
    experimentsDirectory,
    host,
    scenariosDirectory,
  })
  return findResource(experiments, matches, `Experiment "${identifier}"`, experimentsDirectory)
}

export {getExperiment, getExperimentByName, getExperimentByReference}
