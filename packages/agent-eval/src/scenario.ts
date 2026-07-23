import fs from 'node:fs/promises'
import path from 'node:path'
import type {ExperimentScenarioConfig, ScenarioConfig} from '@primer/agent-experiment'

type BuiltInScenarioId = Extract<ExperimentScenarioConfig, string>

type ResolvedScenario = {
  readonly id: string
  readonly directory: string
  readonly config: ScenarioConfig
  readonly testPath: string
}

type ResolveScenarioOptions = {
  builtInScenarioResolver: (id: BuiltInScenarioId) => ResolvedScenario
  cwd?: string
}

function isScenarioConfig(value: unknown): value is ScenarioConfig {
  return (
    value !== null &&
    typeof value === 'object' &&
    'prompt' in value &&
    typeof (value as Record<string, unknown>).prompt === 'string'
  )
}

async function assertDirectory(directory: string, name: string) {
  const stats = await fs.stat(directory).catch(() => undefined)
  if (!stats?.isDirectory()) {
    throw new Error(`Scenario "${name}" directory was not found: ${directory}`)
  }
}

async function assertFile(filepath: string, name: string) {
  const stats = await fs.stat(filepath).catch(() => undefined)
  if (!stats?.isFile()) {
    throw new Error(`Scenario "${name}" test file was not found: ${filepath}`)
  }
}

async function loadScenarioConfig(configPath: string, name: string): Promise<ScenarioConfig> {
  const configModule = (await import(configPath)) as {default?: unknown}
  if (!isScenarioConfig(configModule.default)) {
    throw new Error(`Scenario "${name}" config must export a default config with a prompt`)
  }
  return configModule.default
}

async function resolveExperimentScenario(
  scenarioConfig: ExperimentScenarioConfig,
  options: ResolveScenarioOptions,
): Promise<ResolvedScenario> {
  if (typeof scenarioConfig === 'string') {
    return options.builtInScenarioResolver(scenarioConfig)
  }

  const cwd = options.cwd ?? process.cwd()
  const directory = path.resolve(cwd, scenarioConfig.path)
  const name = scenarioConfig.name ?? path.basename(directory)
  await assertDirectory(directory, name)

  const config = await loadScenarioConfig(path.resolve(directory, 'scenario.config.ts'), name)
  const testPath = path.resolve(directory, 'scenario.test.ts')
  await assertFile(testPath, name)

  return {
    id: name,
    directory,
    config,
    testPath,
  }
}

export {resolveExperimentScenario}
export type {ResolvedScenario}
