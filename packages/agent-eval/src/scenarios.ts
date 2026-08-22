import fs from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import type {ScenarioConfig} from './experiment-config'

type ResolvedScenario = {
  readonly id: string
  readonly directory: string
  readonly config: ScenarioConfig
  readonly testPath: string
  readonly browserTestPath?: string
  readonly turns?: ReadonlyArray<ResolvedScenarioTurn>
}

type ResolvedScenarioTurn = {
  readonly prompt: string
  readonly testPath: string
  readonly browserTestPath?: string
}

type ScenarioSourceOptions = {
  directory?: string
  tags?: ReadonlyArray<string>
}

function resolveScenariosDirectory(options: ScenarioSourceOptions): string {
  return path.resolve(options.directory ?? 'scenarios')
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
  if (value === null || typeof value !== 'object') {
    return false
  }

  const config = value as Record<string, unknown>
  return (
    typeof config.prompt === 'string' &&
    (config.description === undefined || typeof config.description === 'string') &&
    (config.tags === undefined ||
      (Array.isArray(config.tags) && config.tags.every((tag: unknown) => typeof tag === 'string'))) &&
    (config.turns === undefined ||
      (Array.isArray(config.turns) &&
        config.turns.every((turn: unknown) => {
          if (turn === null || typeof turn !== 'object') {
            return false
          }
          const turnConfig = turn as Record<string, unknown>
          return (
            typeof turnConfig.prompt === 'string' &&
            typeof turnConfig.test === 'string' &&
            (turnConfig.browserTest === undefined || typeof turnConfig.browserTest === 'string')
          )
        })))
  )
}

async function loadScenarioConfig(configPath: string, name: string): Promise<ScenarioConfig> {
  const configModule = (await import(pathToFileURL(configPath).href)) as {default?: unknown}
  if (!isScenarioConfig(configModule.default)) {
    throw new Error(
      `Scenario "${name}" config must export a default config with a string prompt, optional string description, optional string[] tags, and optional turns`,
    )
  }

  return configModule.default
}

function resolveScenarioFile(directory: string, filepath: string, name: string): string {
  const scenarioDirectory = path.resolve(directory)
  const resolvedPath = path.resolve(scenarioDirectory, filepath)
  if (path.dirname(resolvedPath) !== scenarioDirectory) {
    throw new Error(`Scenario "${name}" turn file must be a file in the scenario directory: ${filepath}`)
  }
  return resolvedPath
}

async function loadScenarioDirectory(directory: string, name = path.basename(directory)): Promise<ResolvedScenario> {
  await assertScenarioDirectory(directory, name)

  const configPath = path.join(directory, 'scenario.config.ts')
  const testPath = path.join(directory, 'scenario.test.ts')
  const browserTestPath = path.join(directory, 'scenario.browser.test.ts')
  await assertScenarioFile(configPath, name, 'config')
  await assertScenarioFile(testPath, name, 'test')
  const browserTestStats = await fs.stat(browserTestPath).catch(() => undefined)

  const config = await loadScenarioConfig(configPath, name)
  const turns = await Promise.all(
    config.turns?.map(async turn => {
      const turnTestPath = resolveScenarioFile(directory, turn.test, name)
      await assertScenarioFile(turnTestPath, name, 'test')
      const turnBrowserTestPath = turn.browserTest ? resolveScenarioFile(directory, turn.browserTest, name) : undefined
      if (turnBrowserTestPath) {
        await assertScenarioFile(turnBrowserTestPath, name, 'test')
      }
      return {
        prompt: turn.prompt,
        testPath: turnTestPath,
        ...(turnBrowserTestPath ? {browserTestPath: turnBrowserTestPath} : {}),
      }
    }) ?? [],
  )

  return {
    id: name,
    directory,
    config,
    testPath,
    ...(browserTestStats?.isFile() ? {browserTestPath} : {}),
    ...(turns.length > 0 ? {turns} : {}),
  }
}

async function getScenarioDirectoryNames(options: ScenarioSourceOptions): Promise<Array<string>> {
  const scenariosDirectory = resolveScenariosDirectory(options)
  await assertScenariosDirectory(scenariosDirectory)

  const entries = await fs.readdir(scenariosDirectory, {withFileTypes: true})
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .toSorted()
}

async function listScenarios(options: ScenarioSourceOptions = {}): Promise<ReadonlyArray<ResolvedScenario>> {
  const scenariosDirectory = resolveScenariosDirectory(options)
  const names = await getScenarioDirectoryNames(options)
  const scenarios = await Promise.all(
    names.map(name => loadScenarioDirectory(path.join(scenariosDirectory, name), name)),
  )
  return scenarios.filter(scenario => options.tags?.every(tag => scenario.config.tags?.includes(tag)) ?? true)
}

async function findScenario(id: string, options: ScenarioSourceOptions = {}): Promise<ResolvedScenario | undefined> {
  const scenariosDirectory = resolveScenariosDirectory(options)
  await assertScenariosDirectory(scenariosDirectory)

  const directory = path.resolve(scenariosDirectory, id)
  if (path.dirname(directory) !== scenariosDirectory) {
    return undefined
  }

  const stats = await fs.stat(directory).catch(() => undefined)
  if (!stats?.isDirectory()) {
    return undefined
  }

  return loadScenarioDirectory(directory, id)
}

export {findScenario, listScenarios, loadScenarioDirectory}
export type {ResolvedScenario, ResolvedScenarioTurn, ScenarioSourceOptions}
