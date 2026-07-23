import fs from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import type {ScenarioConfig} from '@primer/agent-experiment'

type ResolvedScenario = {
  readonly id: string
  readonly directory: string
  readonly config: ScenarioConfig
  readonly testPath: string
}

type ScenarioSourceOptions = {
  scenariosDirectory?: string
}

function resolveScenariosDirectory(options: ScenarioSourceOptions): string {
  return path.resolve(options.scenariosDirectory ?? 'scenarios')
}

async function assertScenariosDirectory(directory: string) {
  const stats = await fs.stat(directory).catch(() => undefined)
  if (!stats) {
    throw new Error(`Scenarios directory does not exist: ${directory}`)
  }
  if (!stats.isDirectory()) {
    throw new Error(`Scenarios path is not a directory: ${directory}`)
  }
}

async function assertScenarioDirectory(directory: string, name: string) {
  const stats = await fs.stat(directory).catch(() => undefined)
  if (!stats?.isDirectory()) {
    throw new Error(`Scenario "${name}" directory was not found: ${directory}`)
  }
}

async function assertScenarioFile(filepath: string, name: string, kind: 'config' | 'test') {
  const stats = await fs.stat(filepath).catch(() => undefined)
  if (!stats?.isFile()) {
    throw new Error(`Scenario "${name}" ${kind} file was not found: ${filepath}`)
  }
}

function isScenarioConfig(value: unknown): value is ScenarioConfig {
  return (
    value !== null &&
    typeof value === 'object' &&
    'prompt' in value &&
    typeof (value as Record<string, unknown>).prompt === 'string'
  )
}

async function loadScenarioConfig(configPath: string, name: string): Promise<ScenarioConfig> {
  const configModule = (await import(pathToFileURL(configPath).href)) as {default?: unknown}
  if (!isScenarioConfig(configModule.default)) {
    throw new Error(`Scenario "${name}" config must export a default config with a prompt`)
  }
  return configModule.default
}

async function loadScenarioDirectory(directory: string, name = path.basename(directory)): Promise<ResolvedScenario> {
  await assertScenarioDirectory(directory, name)

  const configPath = path.join(directory, 'scenario.config.ts')
  const testPath = path.join(directory, 'scenario.test.ts')
  await assertScenarioFile(configPath, name, 'config')
  await assertScenarioFile(testPath, name, 'test')

  return {
    id: name,
    directory,
    config: await loadScenarioConfig(configPath, name),
    testPath,
  }
}

async function getScenarioDirectoryNames(options: ScenarioSourceOptions): Promise<Array<string>> {
  const scenariosDirectory = resolveScenariosDirectory(options)
  await assertScenariosDirectory(scenariosDirectory)

  const names = (await fs.readdir(scenariosDirectory)).toSorted()
  const entries = await Promise.all(
    names.map(async name => {
      const stats = await fs.stat(path.join(scenariosDirectory, name))
      return {name, isDirectory: stats.isDirectory()}
    }),
  )
  return entries.filter(entry => entry.isDirectory).map(entry => entry.name)
}

async function listScenarios(options: ScenarioSourceOptions = {}): Promise<ReadonlyArray<ResolvedScenario>> {
  const scenariosDirectory = resolveScenariosDirectory(options)
  const names = await getScenarioDirectoryNames(options)
  return Promise.all(names.map(name => loadScenarioDirectory(path.join(scenariosDirectory, name), name)))
}

async function findScenario(id: string, options: ScenarioSourceOptions = {}): Promise<ResolvedScenario | undefined> {
  const names = await getScenarioDirectoryNames(options)
  if (!names.includes(id)) {
    return undefined
  }

  return loadScenarioDirectory(path.join(resolveScenariosDirectory(options), id), id)
}

export {findScenario, listScenarios, loadScenarioDirectory}
export type {ResolvedScenario, ScenarioSourceOptions}
