import path from 'node:path'
import type {ExperimentConfig} from '@primer/agent-eval/experiment'

const {listExperiments, findExperiment} = await import(
  /* turbopackIgnore: true */
  '@primer/agent-eval/experiments'
)

const EXPERIMENTS_DIR = path.resolve(process.cwd(), '..', 'experiments')

export type Experiment = Pick<ExperimentConfig, 'name' | 'description' | 'models' | 'scenarios'> & {
  id: string
  treatments: Array<{name: string}>
}

export async function list(): Promise<Array<Experiment>> {
  const experiments = await listExperiments({
    directory: EXPERIMENTS_DIR,
  })

  return experiments.map(([id, experiment]) => {
    return {
      id,
      name: experiment.name,
      description: experiment.description,
      models: experiment.models,
      scenarios: experiment.scenarios,
      treatments: experiment.treatments.map(t => ({name: t.name})),
    }
  })
}

export async function get(id: string): Promise<Experiment> {
  const experiment = await findExperiment(id, {
    directory: EXPERIMENTS_DIR,
  })

  if (!experiment) {
    throw new Error(`Experiment "${id}" was not found in: ${EXPERIMENTS_DIR}`)
  }

  return {
    id,
    name: experiment.name,
    description: experiment.description,
    models: experiment.models,
    scenarios: experiment.scenarios,
    treatments: experiment.treatments.map(t => ({name: t.name})),
  }
}
