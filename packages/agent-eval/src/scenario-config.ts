import type {ScenarioConfig as ProjectScenarioConfig} from '@primer/agent-experiment'

type ScenarioConfig = ProjectScenarioConfig

function defineScenario(config: ScenarioConfig) {
  return config
}

export {defineScenario}
export type {ScenarioConfig}
