import path from 'node:path'
import type {ExperimentScenarioConfig} from '@primer/agent-experiment'
import {findScenario, loadScenarioDirectory, type ResolvedScenario, type ScenarioSourceOptions} from './scenarios'

type ResolveScenarioOptions = ScenarioSourceOptions & {
  cwd?: string
}

async function resolveExperimentScenario(
  scenarioConfig: ExperimentScenarioConfig,
  options: ResolveScenarioOptions,
): Promise<ResolvedScenario> {
  if (typeof scenarioConfig === 'string') {
    const scenario = await findScenario(scenarioConfig, {
      scenariosDirectory: options.scenariosDirectory,
    })
    if (!scenario) {
      throw new Error(
        `Scenario "${scenarioConfig}" was not found in: ${path.resolve(options.scenariosDirectory ?? 'scenarios')}`,
      )
    }
    return scenario
  }

  const cwd = options.cwd ?? process.cwd()
  const directory = path.resolve(cwd, scenarioConfig.path)
  const name = scenarioConfig.name ?? path.basename(directory)
  return loadScenarioDirectory(directory, name)
}

export {resolveExperimentScenario}
export type {ResolvedScenario} from './scenarios.ts'
