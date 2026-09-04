import path from 'node:path'
import * as z from 'zod/mini'
import {DefaultHost, type Host} from './host'
import {RubricSchema} from './rubric'

const ScenarioConfigSchema = z.object({
  description: z.optional(z.string()),
  prompt: z.string(),
  rubric: z.optional(RubricSchema),
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
  rubric: z.optional(RubricSchema),
  tags: z.array(z.string()),
  testPath: z.string(),
  browserTestPath: z.optional(z.string()),
})

type Scenario = z.infer<typeof ScenarioSchema>

type ScenarioSourceOptions = {
  host?: Host
  directory: string
}

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
  }

  if (config.description) {
    scenario.description = config.description
  }
  if (config.rubric) {
    scenario.rubric = config.rubric
  }

  const browserTestPath = ['browser.test.ts', 'scenario.browser.test.ts']
    .map(filename => path.join(directory, filename))
    .find(filepath => host.existsSync(filepath))
  if (browserTestPath) {
    scenario.browserTestPath = browserTestPath
  }

  return scenario
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
    const scenarioDirectory = path.join(directory, entry.name)
    const data: ScenarioConfigModule = await host.loadModule(path.join(scenarioDirectory, 'scenario.config.ts'))
    if (!ScenarioConfigSchema.safeParse(data.default).success) {
      continue
    }

    scenarios.push(await loadScenario(host, scenarioDirectory, entry.name))
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

export {defineConfig, listScenarios, getScenario, loadScenario, ScenarioSchema, ScenarioConfigSchema}
export type {ScenarioConfig, Scenario, ScenarioSourceOptions}
