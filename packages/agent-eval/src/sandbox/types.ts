import type {Host} from '../host'
import type {McpServerConfig} from '../mcp-config'

type RunOptions = {
  env?: Record<string, string>
  user?: string
  allowNonZeroExitCode?: boolean
}

type CopyOptions = {
  exclude?: Array<string>
}

type DownloadOptions = {
  ignore?: (name: string) => boolean
}

type CommandResult = {
  stdout: string
  stderr: string
  exitCode: number
}

type SandboxCreateOptions = {
  dockerImage?: string
  host?: Host
}

type CustomAgentCopiedFile = {
  sourcePath: string
  destinationPath?: string
}

type CustomAgentWrittenFile = {
  path: string
  content: string
}

type CustomAgentFile = CustomAgentCopiedFile | CustomAgentWrittenFile

type AgentSkillCopiedFile = CustomAgentCopiedFile

type AgentSkillWrittenFile = CustomAgentWrittenFile

type AgentSkillFile = AgentSkillCopiedFile | AgentSkillWrittenFile

type AgentSkillOptions = {
  files?: Array<AgentSkillFile>
}

type RemoteCopilotPluginSource = {
  type: 'remote'
  url: string
  version?: string
}

type LocalCopilotPluginSource = {
  type: 'local'
  sourcePath: string
}

type CopilotPluginSource = RemoteCopilotPluginSource | LocalCopilotPluginSource

type CopilotPluginConfig =
  | CopilotPluginSource
  | {
      type: 'marketplace'
      name: string
      marketplace: {
        name: string
        source: CopilotPluginSource
      }
    }

type CustomAgentOptions = {
  files?: Array<CustomAgentFile>
  tools?: Array<string>
}

interface Sandbox {
  /**
   * Stops and removes the sandbox container.
   */
  [Symbol.asyncDispose](): Promise<void>

  /**
   * Copies a host file or directory into the sandbox.
   */
  copy(sourcePath: string, destinationPath: string, options?: CopyOptions): Promise<void>

  /**
   * Downloads a file or directory from the sandbox to the host.
   */
  download(containerFilePath: string, hostDestinationPath: string, options?: DownloadOptions): Promise<void>

  /**
   * Reads a UTF-8 file from the sandbox.
   */
  readFile(filepath: string): Promise<string>

  /**
   * Writes a UTF-8 file to the sandbox.
   */
  writeFile(filepath: string, contents: string): Promise<void>

  /**
   * Checks whether a file or directory exists in the sandbox.
   */
  exists(filepath: string): Promise<boolean>

  /**
   * Runs a command in the sandbox and captures its output and exit code.
   */
  runCommand(command: string, args?: Array<string>, options?: RunOptions): Promise<CommandResult>

  /**
   * Appends instructions to the sandbox's project-level AGENTS.md file.
   */
  addAgentInstruction(text: string): Promise<void>

  /**
   * Adds an agent skill and its supporting files to the sandbox.
   */
  addAgentSkill(name: string, description: string, contents: string, options?: AgentSkillOptions): Promise<void>

  /**
   * Adds a custom agent and its supporting files to the sandbox.
   */
  addCustomAgent(name: string, description: string, contents: string, options?: CustomAgentOptions): Promise<void>

  /**
   * Adds an MCP server to the sandbox's Copilot configuration.
   */
  addMcpServer(name: string, config: McpServerConfig): Promise<void>

  /**
   * Installs a remote, local, or marketplace Copilot plugin in the sandbox.
   */
  addCopilotPlugin(config: CopilotPluginConfig): Promise<void>
}

interface SandboxConstructor {
  /**
   * Creates a sandbox using the requested runtime options.
   */
  create(options?: SandboxCreateOptions): Promise<Sandbox>
}

export type {
  AgentSkillCopiedFile,
  AgentSkillFile,
  AgentSkillOptions,
  AgentSkillWrittenFile,
  CommandResult,
  CopilotPluginConfig,
  CopilotPluginSource,
  CopyOptions,
  CustomAgentCopiedFile,
  CustomAgentFile,
  CustomAgentOptions,
  CustomAgentWrittenFile,
  DownloadOptions,
  LocalCopilotPluginSource,
  McpServerConfig,
  RemoteCopilotPluginSource,
  RunOptions,
  Sandbox,
  SandboxConstructor,
  SandboxCreateOptions,
}
