import path from 'node:path'
import * as z from 'zod/mini'
import {DefaultHost, type Host} from './host'

const ScenarioConfigSchema = z.object({
  description: z.optional(z.string()),
  prompt: z.string(),
  tags: z.optional(z.array(z.string())),
})

type ScenarioConfig = z.infer<typeof ScenarioConfigSchema>

function defineConfig(config: ScenarioConfig): ScenarioConfig {
  return config
}

type ScenarioConfigModule = {
  default?: unknown
}

const ScenarioSchema = z.object({
  id: z.string(),
  directory: z.string(),
  prompt: z.string(),
  description: z.optional(z.string()),
  tags: z.array(z.string()),
  testPath: z.string(),
  browserTestPath: z.optional(z.string()),
})

type Scenario = z.infer<typeof ScenarioSchema>

type ScenarioSourceOptions = {
  host?: Host
  directory: string
}

function getScenarioSource(
  hostOrOptions: Host | ScenarioSourceOptions,
  directory?: string,
): {host: Host; directory: string} {
  if (directory !== undefined) {
    return {
      host: hostOrOptions as Host,
      directory,
    }
  }

  const options = hostOrOptions as ScenarioSourceOptions
  return {
    host: options.host ?? DefaultHost,
    directory: options.directory,
  }
}

async function listScenarios(options: ScenarioSourceOptions): Promise<Array<Scenario>>
async function listScenarios(host: Host, directory: string): Promise<Array<Scenario>>
async function listScenarios(
  hostOrOptions: Host | ScenarioSourceOptions,
  directory?: string,
): Promise<Array<Scenario>> {
  const source = getScenarioSource(hostOrOptions, directory)
  const {host} = source
  directory = source.directory
  const stats = await host.fs.stat(directory)
  if (!stats.isDirectory()) {
    throw new Error('Expected scenarios path to be a directory')
  }

  const entries = await host.fs.readdir(directory, {
    withFileTypes: true,
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

    if (entry.name.startsWith('000')) {
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
    const data: ScenarioConfigModule = await host.loadModule(path.join(directory, entry.name, 'scenario.config.ts'))
    if (!data.default) {
      continue
    }

    const parseResult = ScenarioConfigSchema.safeParse(data.default)
    if (!parseResult.success) {
      continue
    }

    const {data: config} = parseResult
    const scenario: Scenario = {
      id: entry.name,
      directory: path.join(directory, entry.name),
      prompt: config.prompt,
      tags: config.tags ?? [],
      testPath: path.join(directory, entry.name, 'scenario.test.ts'),
    }

    if (config.description) {
      scenario.description = config.description
    }

    const browserTestPath = path.join(directory, entry.name, 'browser.test.ts')
    if (host.existsSync(browserTestPath)) {
      scenario.browserTestPath = browserTestPath
    }

    scenarios.push(scenario)
  }

  return scenarios
}

async function getScenario(options: ScenarioSourceOptions & {id: string}): Promise<Scenario>
async function getScenario(host: Host, directory: string, id: string): Promise<Scenario>
async function getScenario(
  hostOrOptions: Host | (ScenarioSourceOptions & {id: string}),
  directory?: string,
  id?: string,
): Promise<Scenario> {
  const source = getScenarioSource(hostOrOptions, directory)
  id = id ?? (hostOrOptions as ScenarioSourceOptions & {id: string}).id
  const scenarios = await listScenarios(source)
  const scenario = scenarios.find(candidate => candidate.id === id)
  if (scenario) {
    return scenario
  }

  throw new Error(`Scenario "${id}" was not found in: ${source.directory}`)
}

export {defineConfig, listScenarios, getScenario, ScenarioSchema, ScenarioConfigSchema}
export type {ScenarioConfig, Scenario, ScenarioSourceOptions}
