import path from 'node:path'

const {
  AGENT_EVAL_UI_BENCHMARKS_DIRECTORY = path.resolve(process.cwd(), '..', '..', 'benchmarks'),
  AGENT_EVAL_UI_EXPERIMENTS_DIRECTORY = path.resolve(process.cwd(), '..', '..', 'experiments'),
  AGENT_EVAL_UI_SCENARIOS_DIRECTORY = path.resolve(process.cwd(), '..', '..', 'scenarios'),
} = process.env

export const benchmarksDirectory = AGENT_EVAL_UI_BENCHMARKS_DIRECTORY
export const experimentsDirectory = AGENT_EVAL_UI_EXPERIMENTS_DIRECTORY
export const scenariosDirectory = AGENT_EVAL_UI_SCENARIOS_DIRECTORY
