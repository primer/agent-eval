import {existsSync} from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

type Scenario = {
  id: string
  directory: string
}

async function listScenarios(directory: string): Promise<Array<Scenario>> {
  const stats = await fs.stat(directory)
  if (!stats.isDirectory()) {
    throw new Error('Expected benchmarks to be a directory')
  }

  const entries = await fs.readdir(directory, {
    withFileTypes: true,
  })
  return entries
    .filter(entry => {
      if (!entry.isDirectory()) {
        return false
      }

      const packageJsonPath = path.join(directory, entry.name, 'package.json')
      if (!existsSync(packageJsonPath)) {
        return false
      }

      if (entry.name.startsWith('.')) {
        return false
      }

      if (entry.name.startsWith('000')) {
        return false
      }

      return true
    })
    .map(entry => {
      return {
        id: entry.name,
        directory: path.join(directory, entry.name),
      }
    })
}

async function getScenario(directory: string, id: string): Promise<Scenario> {
  const scenarios = await listScenarios(directory)
  const scenario = scenarios.find(scenario => scenario.id === id)
  if (scenario) {
    return scenario
  }

  throw new Error(`Scenario "${id}" was not found in: ${directory}`)
}

export {listScenarios, getScenario}
export type {Scenario}
