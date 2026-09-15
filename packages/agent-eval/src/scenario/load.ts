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

  const testPath = path.join(directory, 'scenario.test.ts')
  if (!host.existsSync(testPath)) {
    throw new Error(`Scenario "${id}" test file was not found: ${testPath}`)
  }

  const data: ScenarioConfigModule = await host.loadModule(configPath)
  const config = ScenarioConfigSchema.parse(data.default)
  const scenario: Scenario = {
    id,
    directory,
    prompt: config.prompt,
    tags: config.tags ?? [],
    testPath,
    judges: config.judges
      ? await Promise.all(
          config.judges.map(judgeConfig => {
            return parseJudgeConfig(host, directory, judgeConfig)
          }),
        )
      : [],
  }

  if (config.description) {
    scenario.description = config.description
  }

  const browserTestPath = ['browser.test.ts', 'scenario.browser.test.ts']
    .map(filename => {
      return path.join(directory, filename)
    })
    .find(filepath => {
      return host.existsSync(filepath)
    })
  if (browserTestPath) {
    scenario.browserTestPath = browserTestPath
  }

  return scenario
}

export {loadScenario}
