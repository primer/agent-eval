import {models, type ExperimentConfig} from '@primer/agent-experiment'
import {list as listScenarios} from '@primer/agent-scenarios'

export const experiment: ExperimentConfig = {
  name: 'Baseline',
  description: 'The baseline set of results across all scenarios for all models',
  models: [...models],
  scenarios: listScenarios().map(scenario => scenario.id),
  treatments: [],
}
