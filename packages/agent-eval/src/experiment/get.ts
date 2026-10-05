import {DefaultHost, type Host} from '../host'
import {getExperimentId, type Experiment} from './experiment'
import {listExperiments} from './list'

type ExperimentDirectories = {
  experimentsDirectory: string
  host?: Host
  scenariosDirectory: string
}

type GetExperimentOptions = ExperimentDirectories & {
  id: string
}

type GetExperimentByNameOptions = ExperimentDirectories & {
  name: string
}

async function getExperiment({
  experimentsDirectory,
  host = DefaultHost,
  id,
  scenariosDirectory,
}: GetExperimentOptions): Promise<Experiment> {
  const experiments = await listExperiments({experimentsDirectory, host, scenariosDirectory})
  const experiment = experiments.find(candidate => candidate.id === id)
  if (experiment) {
    return experiment
  }

  throw new Error(`Experiment with ID "${id}" was not found in: ${experimentsDirectory}`)
}

async function getExperimentByName({
  experimentsDirectory,
  host = DefaultHost,
  name,
  scenariosDirectory,
}: GetExperimentByNameOptions): Promise<Experiment> {
  const experiments = await listExperiments({experimentsDirectory, host, scenariosDirectory})
  const id = getExperimentId(name)
  const experiment = experiments.find(candidate => candidate.id === id)
  if (experiment) {
    return experiment
  }

  throw new Error(`Experiment "${name}" was not found in: ${experimentsDirectory}`)
}

export {getExperiment, getExperimentByName}
