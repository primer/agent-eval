import path from 'node:path'
import type {Experiment as AgentEvalExperiment} from '@primer/agent-eval'

const {listExperiments, getExperiment} = await import(
  /* turbopackIgnore: true */
  '@primer/agent-eval'
)

const EXPERIMENTS_DIR = path.resolve(process.cwd(), '..', 'experiments')
const BENCHMARKS_DIR = path.resolve(process.cwd(), '..', 'benchmarks')
const SCENARIOS_DIR = path.resolve(process.cwd(), '..', 'scenarios')

export type Experiment = Pick<AgentEvalExperiment, 'id' | 'name' | 'description' | 'models'> & {
  scenarios: Array<{id: string}>
  treatments: Array<{name: string}>
}

export async function list(): Promise<Array<Experiment>> {
  const experiments = await listExperiments({
    benchmarksDirectory: BENCHMARKS_DIR,
    experimentsDirectory: EXPERIMENTS_DIR,
    scenariosDirectory: SCENARIOS_DIR,
  })

  return experiments.map(experiment => {
    return toExperiment(experiment)
  })
}

export async function get(id: string): Promise<Experiment> {
  const experiment = await getExperiment({
    benchmarksDirectory: BENCHMARKS_DIR,
    experimentsDirectory: EXPERIMENTS_DIR,
    scenariosDirectory: SCENARIOS_DIR,
    name: id,
  })

  return toExperiment(experiment)
}

function toExperiment(experiment: AgentEvalExperiment): Experiment {
  const scenarios =
    experiment.type === 'scenario'
      ? experiment.scenarios
      : experiment.benchmark.capabilities.flatMap(capability => {
          return capability.scenarios
        })

  return {
    id: experiment.id,
    name: experiment.name,
    description: experiment.description,
    models: experiment.models,
    scenarios: scenarios.map(scenario => {
      return {id: scenario.id}
    }),
    treatments: experiment.treatments.map(treatment => {
      return {name: treatment.name}
    }),
  }
}

export async function listForScenario(id: string): Promise<Array<Experiment>> {
  const experiments = await list()

  return experiments.filter(experiment => {
    return experiment.scenarios.some(scenario => {
      return scenario.id === id
    })
  })
}
