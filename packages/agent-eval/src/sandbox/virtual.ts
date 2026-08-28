import path from 'node:path'
import {VirtualHost, type Host} from '../host'
import type {McpServerConfig} from '../mcp-config'
import {CONTAINER_WORKDIR} from './constants'
import type {
  AgentSkillOptions,
  CommandResult,
  CopilotPluginConfig,
  CopyOptions,
  CustomAgentOptions,
  DownloadOptions,
  RunOptions,
  Sandbox,
  SandboxCreateOptions,
} from './types'

const defaultCreateOptions: SandboxCreateOptions = {}

export class VirtualSandbox implements Sandbox {
  static async create(options: SandboxCreateOptions = defaultCreateOptions) {
    return new VirtualSandbox(options.host ?? VirtualHost.create())
  }

  [Symbol.asyncDispose](): Promise<void> {
    return Promise.resolve()
  }

  #host: Host

  constructor(host: Host) {
    this.#host = host
  }

  async copy(sourcePath: string, destinationPath: string, options: CopyOptions = {}): Promise<void> {
    const source = path.resolve(sourcePath)
    const sourceStats = await this.#host.fs.stat(source)
    if (!sourceStats.isDirectory() && !sourceStats.isFile()) {
      throw new Error(`Cannot copy "${sourcePath}" because it is not a file or directory`)
    }

    const destination = resolveSandboxPath(destinationPath)
    if (!path.posix.basename(destination)) {
      throw new Error(`Cannot copy "${sourcePath}" to "${destinationPath}" because the destination must include a name`)
    }

    const excludedPaths = new Set(options.exclude?.map(filepath => normalizeExcludedPath(filepath, source)))
    await copyPath(this.#host, source, destination, relativePath => {
      return isExcluded(relativePath, excludedPaths)
    })
  }

  async download(containerFilePath: string, hostDestinationPath: string, options: DownloadOptions = {}): Promise<void> {
    const source = resolveSandboxPath(containerFilePath)
    const destination = path.resolve(hostDestinationPath)
    const sourceStats = await this.#host.fs.stat(source)

    await this.#host.fs.mkdir(destination, {
      recursive: true,
    })

    if (sourceStats.isDirectory()) {
      const entries = await this.#host.fs.readdir(source)
      for (const entry of entries) {
        const name = entry.toString()
        if (options.ignore?.(name)) {
          continue
        }

        await copyPath(this.#host, path.join(source, name), path.join(destination, name), relativePath => {
          return options.ignore?.(path.posix.join(name, relativePath)) ?? false
        })
      }
      return
    }

    const name = path.basename(source)
    if (!options.ignore?.(name)) {
      await copyPath(this.#host, source, path.join(destination, name))
    }
  }

  readFile(filepath: string): Promise<string> {
    return this.#host.fs.readFile(resolveSandboxPath(filepath), 'utf8')
  }

  async writeFile(filepath: string, contents: string): Promise<void> {
    const destination = resolveSandboxPath(filepath)
    await this.#host.fs.mkdir(path.dirname(destination), {
      recursive: true,
    })
    await this.#host.fs.writeFile(destination, contents, 'utf8')
  }

  async exists(filepath: string): Promise<boolean> {
    try {
      await this.#host.fs.access(resolveSandboxPath(filepath))
      return true
    } catch (error) {
      if (isErrorWithCode(error, 'ENOENT')) {
        return false
      }

      throw error
    }
  }

  runCommand(command: string, args?: Array<string>, options?: RunOptions): Promise<CommandResult> {
    void command
    void args
    void options
    throw new Error('Method not implemented.')
  }

  addAgentInstruction(text: string): Promise<void> {
    void text
    throw new Error('Method not implemented.')
  }

  addAgentSkill(name: string, description: string, contents: string, options?: AgentSkillOptions): Promise<void> {
    void name
    void description
    void contents
    void options
    throw new Error('Method not implemented.')
  }

  addCustomAgent(name: string, description: string, contents: string, options?: CustomAgentOptions): Promise<void> {
    void name
    void description
    void contents
    void options
    throw new Error('Method not implemented.')
  }

  addMcpServer(name: string, config: McpServerConfig): Promise<void> {
    void name
    void config
    throw new Error('Method not implemented.')
  }

  addCopilotPlugin(config: CopilotPluginConfig): Promise<void> {
    void config
    throw new Error('Method not implemented.')
  }
}

function resolveSandboxPath(filepath: string): string {
  if (path.posix.isAbsolute(filepath)) {
    return filepath
  }

  return path.posix.join(CONTAINER_WORKDIR, filepath)
}

async function copyPath(
  host: Host,
  source: string,
  destination: string,
  ignore: (relativePath: string) => boolean = () => {
    return false
  },
  root: string = source,
): Promise<void> {
  const relativePath = normalizeCopyPath(path.relative(root, source))
  if (ignore(relativePath)) {
    return
  }

  const stats = await host.fs.stat(source)
  if (stats.isDirectory()) {
    await host.fs.mkdir(destination, {
      recursive: true,
    })

    const entries = await host.fs.readdir(source)
    for (const entry of entries) {
      const name = entry.toString()
      await copyPath(host, path.join(source, name), path.join(destination, name), ignore, root)
    }
    return
  }

  if (!stats.isFile()) {
    throw new Error(`Cannot copy "${source}" because it is not a file or directory`)
  }

  await host.fs.mkdir(path.dirname(destination), {
    recursive: true,
  })
  await host.fs.copyFile(source, destination)
}

function normalizeCopyPath(filepath: string): string {
  const normalized = path.posix.normalize(filepath.split(path.sep).join(path.posix.sep))
  if (normalized === '.') {
    return ''
  }

  return normalized.replace(/\/$/, '')
}

function normalizeExcludedPath(filepath: string, source: string): string {
  if (path.isAbsolute(filepath)) {
    return normalizeCopyPath(path.relative(source, filepath))
  }

  return normalizeCopyPath(filepath)
}

function isExcluded(relativePath: string, excludedPaths: ReadonlySet<string>): boolean {
  if (!relativePath) {
    return false
  }

  for (const excludedPath of excludedPaths) {
    if (relativePath === excludedPath || relativePath.startsWith(`${excludedPath}/`)) {
      return true
    }
  }

  return false
}

function isErrorWithCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}
