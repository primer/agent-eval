import path from 'node:path'
import {DefaultHost, type Host} from '../host'
import {parseJudgeConfig} from '../judge'
import {parseScenarioConfig, type ScenarioConfigModule} from './config'
import {defaultScenarioSetup, getScenarioId, type Scenario} from './scenario'
import {parseCheckConfig} from '../check'
import {getRelativePath} from '../path'

type LoadScenarioOptions = {
  directory: string
  host?: Host
  name?: string
  scenariosDirectory?: string
}

async function loadScenario({
  directory,
  host = DefaultHost,
  name = path.basename(directory),
  scenariosDirectory = path.dirname(directory),
}: LoadScenarioOptions): Promise<Scenario> {
  if (!host.fs.existsSync(directory)) {
    throw new Error(`Scenario "${name}" directory was not found: ${directory}`)
  }

  const stats = await host.fs.promises.stat(directory)
  if (!stats.isDirectory()) {
    throw new Error(`Scenario "${name}" directory was not found: ${directory}`)
  }

  const configPath = path.join(directory, 'scenario.config.ts')
  if (!host.fs.existsSync(configPath)) {
    throw new Error(`Scenario "${name}" config file was not found: ${configPath}`)
  }

  const data: ScenarioConfigModule = await host.loadModule(configPath)
  const config = parseScenarioConfig(host, directory, data.default)

  const scenario: Scenario = {
    id: config.id ?? getScenarioId(getRelativePath(scenariosDirectory, directory)),
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
    image: config.image ?? {type: 'Default'},
    setup: config.setup ? config.setup : config.image ? undefined : defaultScenarioSetup,
  }

  if (config.description) {
    scenario.description = config.description
  }

  return scenario
}

export {loadScenario}
