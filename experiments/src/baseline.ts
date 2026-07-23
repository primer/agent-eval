import {existsSync} from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import {models, type ExperimentConfig, type ExperimentScenarioConfig} from '@primer/agent-experiment'

const SCENARIOS_DIR = path.resolve(import.meta.dirname, '../../scenarios')
const scenarios: Array<ExperimentScenarioConfig> = await fs
  .readdir(SCENARIOS_DIR, {withFileTypes: true})
  .then(entries =>
    entries
      .filter(entry => entry.isDirectory() && existsSync(path.join(SCENARIOS_DIR, entry.name, 'scenario.config.ts')))
      .map(entry => entry.name as ExperimentScenarioConfig)
      .toSorted(),
  )

export const experiment: ExperimentConfig = {
  name: 'Baseline',
  description: 'The baseline set of results across all scenarios for all models',
  models: [...models],
  scenarios,
  treatments: [],
}
