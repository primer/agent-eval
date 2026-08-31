import path from 'node:path'
import {VirtualHost, type Host} from '../host'
import {resolveContainerPath} from './path'
import type {CommandResult, CopyOptions, DownloadOptions, RunOptions, Sandbox, SandboxCreateOptions} from './types'

const defaultCreateOptions: SandboxCreateOptions = {}

type CommandListener = (
  command: string,
  args?: Array<string>,
  options?: RunOptions,
) => CommandResult | Promise<CommandResult | undefined> | undefined

export class VirtualSandbox implements Sandbox {
  static async create(options: SandboxCreateOptions = defaultCreateOptions) {
    return new VirtualSandbox(options.host ?? VirtualHost.create())
  }

  [Symbol.asyncDispose](): Promise<void> {
    return Promise.resolve()
  }

  #host: Host
  #commandListeners: Set<CommandListener> = new Set()
  #commands: Array<[command: string, args: Array<string>, options: RunOptions, result: CommandResult]> = []

  constructor(host: Host) {
    this.#host = host
  }

  async copy(sourcePath: string, destinationPath: string, options: CopyOptions = {}): Promise<void> {
    const source = path.resolve(sourcePath)
    const sourceStats = await this.#host.fs.stat(source)
    if (!sourceStats.isDirectory() && !sourceStats.isFile()) {
      throw new Error(`Cannot copy "${sourcePath}" because it is not a file or directory`)
    }

    const destination = resolveContainerPath(destinationPath)
    if (!path.posix.basename(destination)) {
      throw new Error(`Cannot copy "${sourcePath}" to "${destinationPath}" because the destination must include a name`)
    }

    const excludedPaths = new Set(options.exclude?.map(filepath => normalizeExcludedPath(filepath, source)))
    await copyPath(this.#host, source, destination, relativePath => {
      return isExcluded(relativePath, excludedPaths)
    })
  }

  async download(containerFilePath: string, hostDestinationPath: string, options: DownloadOptions = {}): Promise<void> {
    const source = resolveContainerPath(containerFilePath)
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

        await copyPath(this.#host, path.posix.join(source, name), path.join(destination, name), relativePath => {
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
    return this.#host.fs.readFile(resolveContainerPath(filepath), 'utf8')
  }

  async writeFile(filepath: string, contents: string): Promise<void> {
    const destination = resolveContainerPath(filepath)
    await this.#host.fs.mkdir(path.posix.dirname(destination), {
      recursive: true,
    })
    await this.#host.fs.writeFile(destination, contents, 'utf8')
  }

  async exists(filepath: string): Promise<boolean> {
    try {
      await this.#host.fs.access(resolveContainerPath(filepath))
      return true
    } catch (error) {
      if (isErrorWithCode(error, 'ENOENT')) {
        return false
      }

      throw error
    }
  }

  async runCommand(command: string, args: Array<string> = [], options: RunOptions = {}): Promise<CommandResult> {
    for (const listener of this.#commandListeners) {
      const result = await listener(command, args, options)
      if (result) {
        this.#commands.push([command, args, options, result])
        return result
      }
    }

    const result: CommandResult = {
      stdout: '',
      stderr: '',
      exitCode: 0,
    }
    this.#commands.push([command, args, options, result])

    return result
  }

  async addAgentInstruction(): Promise<void> {}

  async addAgentSkill(): Promise<void> {}

  async addCustomAgent(): Promise<void> {}

  async addMcpServer(): Promise<void> {}

  async addCopilotPlugin(): Promise<void> {}

  addCommandListener(listener: CommandListener): void {
    this.#commandListeners.add(listener)
  }
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
