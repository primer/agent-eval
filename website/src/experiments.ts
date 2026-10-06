import path from 'node:path'
import type {Experiment as AgentEvalExperiment} from '@primer/agent-eval'

const {listExperiments, getExperiment, getExperimentScenarios} = await import(
  /* turbopackIgnore: true */
  '@primer/agent-eval'
)

const EXPERIMENTS_DIR = path.resolve(process.cwd(), '..', 'experiments')
const SCENARIOS_DIR = path.resolve(process.cwd(), '..', 'scenarios')
const BENCHMARKS_DIR = path.resolve(process.cwd(), '..', 'benchmarks')

export type Experiment = Pick<AgentEvalExperiment, 'id' | 'name' | 'description' | 'models'> & {
  scenarios: Array<{id: string}>
  treatments: Array<{name: string}>
  benchmark?: {id: string; name: string}
}

function toExperiment(experiment: AgentEvalExperiment): Experiment {
  return {
    id: experiment.id,
    name: experiment.name,
    description: experiment.description,
    models: experiment.models,
    ...(experiment.type === 'benchmark'
      ? {
          benchmark: {
            id: experiment.benchmark.id,
            name: experiment.benchmark.name,
          },
        }
      : {}),
    scenarios: getExperimentScenarios(experiment).map(scenario => {
      return {
        id: scenario.id,
      }
    }),
    treatments: experiment.treatments.map(treatment => {
      return {
        name: treatment.name,
      }
    }),
  }
}

export async function list(): Promise<Array<Experiment>> {
  const experiments = await listExperiments({
    experimentsDirectory: EXPERIMENTS_DIR,
    scenariosDirectory: SCENARIOS_DIR,
    benchmarksDirectory: BENCHMARKS_DIR,
  })

  return experiments.map(toExperiment)
}

export async function get(id: string): Promise<Experiment> {
  const experiment = await getExperiment({
    experimentsDirectory: EXPERIMENTS_DIR,
    scenariosDirectory: SCENARIOS_DIR,
    benchmarksDirectory: BENCHMARKS_DIR,
    name: id,
  })

  return toExperiment(experiment)
}

export async function listForScenario(id: string): Promise<Array<Experiment>> {
  const experiments = await list()

  return experiments.filter(experiment => {
    return experiment.scenarios.some(scenario => {
      return scenario.id === id
    })
  })
}
