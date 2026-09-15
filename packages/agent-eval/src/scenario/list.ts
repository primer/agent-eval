import path from 'node:path'
import {DefaultHost, type Host} from '../host'
import {ScenarioConfigSchema, type ScenarioConfigModule} from './config'
import {loadScenario} from './load'
import type {Scenario} from './scenario'

type ListScenariosOptions = {
  directory: string
  host?: Host
}

async function listScenarios({directory, host = DefaultHost}: ListScenariosOptions): Promise<Array<Scenario>> {
  const stats = await host.fs.stat(directory)
  if (!stats.isDirectory()) {
    throw new Error('Expected scenarios path to be a directory')
  }

  const entries = (
    await host.fs.readdir(directory, {
      withFileTypes: true,
    })
  ).sort((a, b) => {
    return a.name.localeCompare(b.name)
  })
  const candidates = entries.filter(entry => {
    if (!entry.isDirectory()) {
      return false
    }

    const packageJsonPath = path.join(directory, entry.name, 'package.json')
    if (!host.existsSync(packageJsonPath)) {
      return false
    }

    if (entry.name.startsWith('.')) {
      return false
    }

    const scenarioConfigPath = path.join(directory, entry.name, 'scenario.config.ts')
    if (!host.existsSync(scenarioConfigPath)) {
      return false
    }

    const testPath = path.join(directory, entry.name, 'scenario.test.ts')
    if (!host.existsSync(testPath)) {
      return false
    }

    return true
  })
  const scenarios: Array<Scenario> = []

  for (const entry of candidates) {
    const scenarioDirectory = path.join(directory, entry.name)
    const data: ScenarioConfigModule = await host.loadModule(path.join(scenarioDirectory, 'scenario.config.ts'))
    if (!ScenarioConfigSchema.safeParse(data.default).success) {
      continue
    }

    scenarios.push(await loadScenario({host, directory: scenarioDirectory, name: entry.name}))
  }

  return scenarios
}

export {listScenarios}
