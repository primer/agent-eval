import path from 'node:path'
import type {Experiment as AgentEvalExperiment} from '@primer/agent-eval/experiment'

const {listExperiments, getExperiment} = await import(
  /* turbopackIgnore: true */
  '@primer/agent-eval/experiment'
)

const EXPERIMENTS_DIR = path.resolve(process.cwd(), '..', 'experiments')
const SCENARIOS_DIR = path.resolve(process.cwd(), '..', 'scenarios')

export type Experiment = Pick<AgentEvalExperiment, 'id' | 'name' | 'description' | 'models'> & {
  scenarios: Array<{id: string}>
  treatments: Array<{name: string}>
}

export async function list(): Promise<Array<Experiment>> {
  const experiments = await listExperiments({
    experimentsDirectory: EXPERIMENTS_DIR,
    scenariosDirectory: SCENARIOS_DIR,
  })

  return experiments.map(experiment => {
    return {
      id: experiment.id,
      name: experiment.name,
      description: experiment.description,
      models: experiment.models,
      scenarios: experiment.scenarios.map(scenario => ({id: scenario.id})),
      treatments: experiment.treatments.map(t => ({name: t.name})),
    }
  })
}

export async function get(id: string): Promise<Experiment> {
  const experiment = await getExperiment({
    experimentsDirectory: EXPERIMENTS_DIR,
    scenariosDirectory: SCENARIOS_DIR,
    id,
  })

  return {
    id: experiment.id,
    name: experiment.name,
    description: experiment.description,
    models: experiment.models,
    scenarios: experiment.scenarios.map(scenario => ({id: scenario.id})),
    treatments: experiment.treatments.map(t => ({name: t.name})),
  }
}

export async function listForScenario(id: string): Promise<Array<Experiment>> {
  const experiments = await list()

  return experiments.filter(experiment => experiment.scenarios.some(scenario => scenario.id === id))
}
