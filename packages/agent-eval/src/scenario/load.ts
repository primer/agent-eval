import path from 'node:path'
import * as z from 'zod/mini'
import {DefaultHost, type Host} from '../host'
import {parseJudgeConfig} from '../judge'
import {parseScenarioConfig, type ScenarioConfigModule} from './config'
import {createDefaultScenarioSetup, defaultScenarioSetup, type Scenario} from './scenario'
import {parsePackageManager} from './package-manager'
import {parseCheckConfig} from '../check'

const PackageJsonSchema = z.object({
  packageManager: z.optional(z.unknown()),
})

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
  const packageManager = config.setup || config.image ? undefined : await loadPackageManager(host, directory)
  const defaultSetup = packageManager
    ? packageManager.specifier
      ? createDefaultScenarioSetup(packageManager)
      : defaultScenarioSetup
    : undefined

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
    image: config.image ?? {type: 'Default'},
    ...(packageManager ? {packageManager} : {}),
    setup: config.setup ?? defaultSetup,
  }

  if (config.description) {
    scenario.description = config.description
  }

  return scenario
}

async function loadPackageManager(host: Host, directory: string) {
  const packageJsonPath = path.join(directory, 'package.json')
  if (!host.fs.existsSync(packageJsonPath)) {
    return parsePackageManager(undefined)
  }

  const packageJson = PackageJsonSchema.parse(JSON.parse(await host.fs.promises.readFile(packageJsonPath, 'utf8')))
  return parsePackageManager(packageJson.packageManager)
}

export {loadScenario}
