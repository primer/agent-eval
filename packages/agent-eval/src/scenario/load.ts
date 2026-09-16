import path from 'node:path'
import {DefaultHost, type Host} from '../host'
import {parseJudgeConfig} from '../judge'
import {ScenarioConfigSchema, type ScenarioConfigModule} from './config'
import type {Scenario} from './scenario'
import {parseCheckConfig} from '../check'
import {validateScenarioImage} from './image-config'

type LoadScenarioOptions = {
  directory: string
  host?: Host
  name?: string
}

async function loadScenario({
  directory,
  host = DefaultHost,
  name = path.basename(directory),
}: LoadScenarioOptions): Promise<Scenario> {
  if (!host.existsSync(directory)) {
    throw new Error(`Scenario "${name}" directory was not found: ${directory}`)
  }

  const stats = await host.fs.stat(directory)
  if (!stats.isDirectory()) {
    throw new Error(`Scenario "${name}" directory was not found: ${directory}`)
  }

  const configPath = path.join(directory, 'scenario.config.ts')
  if (!host.existsSync(configPath)) {
    throw new Error(`Scenario "${name}" config file was not found: ${configPath}`)
  }

  const data: ScenarioConfigModule = await host.loadModule(configPath)
  const config = ScenarioConfigSchema.parse(data.default)
  if (config.image !== undefined) {
    await validateScenarioImage(host, directory, config.image)
  }
  const scenario: Scenario = {
    id: name,
    directory,
    prompt: config.prompt,
    tags: config.tags,
    checks: await Promise.all(
      config.checks.map(checkConfig => {
        return parseCheckConfig(host, directory, checkConfig)
      }),
    ),
    judges: await Promise.all(
      config.judges.map(judgeConfig => {
        return parseJudgeConfig(host, directory, judgeConfig)
      }),
    ),
  }

  if (config.description) {
    scenario.description = config.description
  }

  if (config.image !== undefined) {
    scenario.image = config.image
  }

  return scenario
}

export {loadScenario}
