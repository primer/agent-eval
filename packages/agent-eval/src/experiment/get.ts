import {DefaultHost, type Host} from '../host'
import type {Experiment} from './experiment'
import {listExperiments} from './list'

type GetExperimentOptions = {
  experimentsDirectory: string
  host?: Host
  scenariosDirectory: string
} & ({id: string; name?: never} | {id?: never; name: string})

async function getExperiment(options: GetExperimentOptions): Promise<Experiment> {
  const {experimentsDirectory, host = DefaultHost, scenariosDirectory} = options
  const experiments = await listExperiments({
    host,
    experimentsDirectory,
    scenariosDirectory,
  })
  const identifier = options.id ?? options.name
  const experiment =
    options.id === undefined
      ? (experiments.find(candidate => candidate.name === options.name) ??
        experiments.find(candidate => candidate.id === options.name))
      : experiments.find(candidate => candidate.id === options.id)
  if (experiment) {
    return experiment
  }

  throw new Error(`Experiment "${identifier}" was not found in: ${experimentsDirectory}`)
}

export {getExperiment}
