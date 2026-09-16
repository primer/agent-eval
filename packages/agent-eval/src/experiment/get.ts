import {DefaultHost, type Host} from '../host'
import type {Experiment} from './experiment'
import {listExperiments} from './list'

type GetExperimentOptions = {
  experimentsDirectory: string
  host?: Host
  scenariosDirectory: string
  name: string
}

async function getExperiment({
  experimentsDirectory,
  host = DefaultHost,
  name,
  scenariosDirectory,
}: GetExperimentOptions): Promise<Experiment> {
  const experiments = await listExperiments({
    host,
    experimentsDirectory,
    scenariosDirectory,
  })
  const experiment = experiments.find(candidate => {
    return candidate.id === name
  })
  if (experiment) {
    return experiment
  }

  throw new Error(`Experiment "${name}" was not found in: ${experimentsDirectory}`)
}

export {getExperiment}
