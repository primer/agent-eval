import path from 'node:path'

const {
  // AGENT_EVAL_ARTIFACTS_DIRECTORY,
  AGENT_EVAL_UI_BENCHMARKS_DIRECTORY = path.resolve(process.cwd(), '..', '..', 'benchmarks'),
  AGENT_EVAL_UI_SCENARIOS_DIRECTORY = path.resolve(process.cwd(), '..', '..', 'scenarios'),
  // AGENT_EVAL_EXPERIMENTS_DIRECTORY,
  // AGENT_EVAL_RESULTS_DIRECTORY,
  // AGENT_EVAL_OUTPUT_PATH,
  // AGENT_EVAL_SCENARIOS_DIRECTORY,
} = process.env

export const benchmarksDirectory = AGENT_EVAL_UI_BENCHMARKS_DIRECTORY
export const scenariosDirectory = AGENT_EVAL_UI_SCENARIOS_DIRECTORY
