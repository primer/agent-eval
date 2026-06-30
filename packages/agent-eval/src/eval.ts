import fs from 'node:fs/promises'
import path from 'node:path'
import type {EvalConfig, ExperimentEvalConfig} from '@primer/agent-experiment'

type BuiltInEvalId = Extract<ExperimentEvalConfig, string>

type ResolvedEval = {
  readonly id: string
  readonly directory: string
  readonly config: EvalConfig
  readonly testPath: string
}

type ResolveEvalOptions = {
  builtInEvalResolver: (id: BuiltInEvalId) => ResolvedEval
  cwd?: string
}

function isEvalConfig(value: unknown): value is EvalConfig {
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
    throw new Error(`Eval "${name}" directory was not found: ${directory}`)
  }
}

async function assertFile(filepath: string, name: string) {
  const stats = await fs.stat(filepath).catch(() => undefined)
  if (!stats?.isFile()) {
    throw new Error(`Eval "${name}" test file was not found: ${filepath}`)
  }
}

async function loadEvalConfig(configPath: string, name: string): Promise<EvalConfig> {
  const configModule = (await import(configPath)) as {default?: unknown}
  if (!isEvalConfig(configModule.default)) {
    throw new Error(`Eval "${name}" config must export a default config with a prompt`)
  }
  return configModule.default
}

async function resolveExperimentEval(
  evalConfig: ExperimentEvalConfig,
  options: ResolveEvalOptions,
): Promise<ResolvedEval> {
  if (typeof evalConfig === 'string') {
    return options.builtInEvalResolver(evalConfig)
  }

  const cwd = options.cwd ?? process.cwd()
  const directory = path.resolve(cwd, evalConfig.path)
  const name = evalConfig.name ?? path.basename(directory)
  await assertDirectory(directory, name)

  const config = await loadEvalConfig(path.resolve(directory, 'eval.config.ts'), name)
  const testPath = path.resolve(directory, 'eval.test.ts')
  await assertFile(testPath, name)

  return {
    id: name,
    directory,
    config,
    testPath,
  }
}

export {resolveExperimentEval}
export type {ResolvedEval}
