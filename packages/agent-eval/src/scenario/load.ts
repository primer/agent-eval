import path from 'node:path'
import type {Host} from '../host'
import {parseJudgeConfig} from '../judge'
import {ScenarioConfigSchema, type ScenarioConfigModule} from './config'
import type {Scenario} from './scenario'

async function loadScenario(host: Host, directory: string, id = path.basename(directory)): Promise<Scenario> {
  if (!host.existsSync(directory)) {
    throw new Error(`Scenario "${id}" directory was not found: ${directory}`)
  }

  const stats = await host.fs.stat(directory)
  if (!stats.isDirectory()) {
    throw new Error(`Scenario "${id}" directory was not found: ${directory}`)
  }

  const configPath = path.join(directory, 'scenario.config.ts')
  if (!host.existsSync(configPath)) {
    throw new Error(`Scenario "${id}" config file was not found: ${configPath}`)
  }

  const data: ScenarioConfigModule = await host.loadModule(configPath)
  const config = ScenarioConfigSchema.parse(data.default)
  const scenario: Scenario = {
    id,
    directory,
    prompt: config.prompt,
    tags: config.tags,
    checks: config.checks,
    judges: await Promise.all(
      config.judges.map(judgeConfig => {
        return parseJudgeConfig(host, directory, judgeConfig)
      }),
    ),
  }

  if (config.description) {
    scenario.description = config.description
  }

  return scenario
}

export {loadScenario}
