type EvalConfig = {
  prompt: string
}

type Model =
  | 'claude-haiku-4.5'
  | 'claude-opus-4.6'
  | 'claude-opus-4.7'
  | 'claude-sonnet-4.5'
  | 'claude-sonnet-4.6'
  | 'gpt-5.4'
  | 'gpt-5.4-mini'
  | 'gpt-5.5'

type CommandResult = {
  stdout: string
  stderr: string
  exitCode: number
}

type McpServerConfig = {
  command: string
  type: 'local'
  args?: Array<string>
  env?: Record<string, string>
  tools?: Array<string>
}

type Sandbox = {
  addAgentInstruction(text: string): Promise<void>
  addAgentSkill(name: string, description: string, contents: string): Promise<void>
  addMcpServer(name: string, config: McpServerConfig): Promise<void>
  copy(sourcePath: string, destinationPath: string, options?: {exclude?: Array<string>}): Promise<void>
  download(
    containerFilePath: string,
    hostDestinationPath: string,
    options?: {ignore?: (name: string) => boolean},
  ): Promise<void>
  exists(filepath: string): Promise<boolean>
  readFile(filepath: string): Promise<string>
  runCommand(
    command: string,
    args?: Array<string>,
    options?: {env?: Record<string, string>; user?: string; allowNonZeroExitCode?: boolean},
  ): Promise<CommandResult>
  writeFile(filepath: string, contents: string): Promise<void>
}

type ExperimentConfig = {
  name: string
  description: string
  models: Array<Model>
  evals: Array<string>
  treatments: Array<TreatmentConfig>
}

type TreatmentConfig = {
  name: string
  setup?: ({sandbox}: {sandbox: Sandbox}) => Promise<void>
}

function defineConfig(config: EvalConfig) {
  return config
}

function defineExperimentConfig(config: ExperimentConfig) {
  return config
}

export type {EvalConfig, ExperimentConfig, McpServerConfig, Model, Sandbox, TreatmentConfig}
export {defineConfig, defineExperimentConfig}
