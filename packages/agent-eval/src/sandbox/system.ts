import {randomUUID} from 'node:crypto'
import path from 'node:path'
import {pipeline} from 'node:stream/promises'
import tarFs from 'tar-fs'
import type {Headers} from 'tar-fs'
import tarStream from 'tar-stream'
import * as z from 'zod/mini'
import {McpConfigFileSchema} from '../mcp-config'
import type {McpConfigFile} from '../mcp-config'
import {
  AGENT_INSTRUCTIONS_PATH,
  CONTAINER_WORKDIR,
  COPILOT_PLUGIN_SOURCES_DIR,
  CUSTOM_AGENTS_DIR,
  DEFAULT_DOCKER_IMAGE,
  MCP_CONFIG_PATH,
  NODE_USER,
  SANDBOX_GID,
  SANDBOX_UID,
  SKILLS_DIR,
} from './constants'
import type {
  AgentSkillFile,
  AgentSkillOptions,
  AgentSkillWrittenFile,
  CommandResult,
  CopilotPluginConfig,
  CopilotPluginSource,
  CopyOptions,
  CustomAgentFile,
  CustomAgentOptions,
  CustomAgentWrittenFile,
  DownloadOptions,
  McpServerConfig,
  RunOptions,
  Sandbox,
  SandboxCreateOptions,
} from './types'
import {DefaultHost, type Host} from '../host'
import {VirtualSandbox} from './virtual'
import {resolveContainerPath} from './path'
import {logger} from '../logger'
import {createContainer, removeContainer, exec, type RunningContainer} from '../docker'
import {getSandboxImageBuild} from './images/sandbox'

const DEFAULT_MCP_CONFIG: McpConfigFile = {
  mcpServers: {},
}

class SystemSandbox implements Sandbox {
  static async create(options: SandboxCreateOptions = {}) {
    const sandboxImage = await getSandboxImageBuild({
      baseImage: options.dockerImage?.tagName ?? DEFAULT_DOCKER_IMAGE,
    })

    logger.info('Creating container: %s', sandboxImage.tagName)
    const container = await createContainer({
      image: sandboxImage,
    })

    return new SystemSandbox(options.host ?? DefaultHost, container)
  }

  #container: RunningContainer
  #host: Host

  constructor(host: Host, container: RunningContainer) {
    this.#host = host
    this.#container = container
  }

  async [Symbol.asyncDispose]() {
    await removeContainer(this.#container)
  }

  async copy(sourcePath: string, destinationPath: string, options: CopyOptions = {}): Promise<void> {
    const source = path.resolve(sourcePath)
    const sourceStats = await this.#host.fs.stat(source)
    if (!sourceStats.isDirectory() && !sourceStats.isFile()) {
      throw new Error(`Cannot copy "${sourcePath}" because it is not a file or directory`)
    }

    const containerPath = resolveContainerPath(destinationPath)
    const containerDirectory = path.posix.dirname(containerPath)
    const destinationName = path.posix.basename(containerPath)
    if (!destinationName) {
      throw new Error(`Cannot copy "${sourcePath}" to "${destinationPath}" because the destination must include a name`)
    }

    await execCommand(this.#container, 'mkdir', ['-p', containerDirectory], {
      user: NODE_USER,
    })

    const sourceDirectory = path.dirname(source)
    const sourceName = path.basename(source)
    const excludedPaths = new Set(options.exclude?.map(filepath => normalizeExcludedPath(filepath, source)))
    const archive = tarFs.pack(sourceDirectory, {
      entries: [sourceName],
      ignore(name) {
        const absolutePath = path.isAbsolute(name) ? name : path.resolve(sourceDirectory, name)
        const relativePath = normalizeCopyPath(path.relative(source, absolutePath))
        return isExcluded(relativePath, excludedPaths)
      },
      map(header) {
        return mapCopiedHeader(header, sourceName, destinationName)
      },
    })

    await this.#container.putArchive(archive, {
      path: containerDirectory,
    })
  }

  async download(containerFilePath: string, hostDestinationPath: string, options: DownloadOptions = {}): Promise<void> {
    const containerPath = resolveContainerPath(containerFilePath)

    await this.#host.fs.mkdir(hostDestinationPath, {
      recursive: true,
    })

    const archive = await this.#container.getArchive({
      path: containerPath,
    })
    const sourceName = path.posix.basename(containerPath)

    await pipeline(
      archive,
      tarFs.extract(hostDestinationPath, {
        readable: true,
        writable: true,
        map(header) {
          const prefix = `${sourceName}/`

          if (header.name === sourceName) {
            header.name = '.'
          } else if (header.name.startsWith(prefix)) {
            header.name = header.name.slice(prefix.length)
          }

          return header
        },
        ignore: options.ignore,
      }),
    )
  }

  async readdir(filepath: string): Promise<Array<string>> {
    const result = await execCommand(this.#container, 'ls', ['-1A', resolveContainerPath(filepath)], {
      user: NODE_USER,
      allowNonZeroExitCode: true,
    })

    if (result.exitCode !== 0) {
      throw new Error(`Failed to read directory "${filepath}": ${result.stderr}`)
    }

    return result.stdout.split('\n').filter(line => line.trim() !== '')
  }

  async readFile(filepath: string): Promise<string> {
    const archive = await this.#container.getArchive({
      path: resolveContainerPath(filepath),
    })
    const buffer = await readFileFromArchive(archive)
    return buffer.toString('utf8')
  }

  async writeFile(filepath: string, contents: string): Promise<void> {
    const containerPath = resolveContainerPath(filepath)
    const directory = path.dirname(containerPath)
    const name = path.basename(containerPath)
    const pack = tarStream.pack()
    const upload = this.#container.putArchive(pack, {
      path: directory,
    })

    pack.entry(
      {
        name,
        mode: 0o644,
        size: Buffer.byteLength(contents),
        uid: SANDBOX_UID,
        gid: SANDBOX_GID,
      },
      contents,
    )
    pack.finalize()

    await upload
  }

  async exists(filepath: string): Promise<boolean> {
    const result = await execCommand(this.#container, 'test', ['-e', resolveContainerPath(filepath)], {
      user: NODE_USER,
      allowNonZeroExitCode: true,
    })

    return result.exitCode === 0
  }

  async runCommand(command: string, args: Array<string> = [], options?: RunOptions): Promise<CommandResult> {
    logger.debug('[sandbox] Running command: %s %s', command, args.join(' '))
    return execCommand(this.#container, command, args, {
      env: {
        HOME: options?.user === 'root' ? '/root' : '/home/node',
        ...options?.env,
        // PATH: `${NPM_GLOBAL_DIR}/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
      },
      user: options?.user ?? NODE_USER,
      allowNonZeroExitCode: options?.allowNonZeroExitCode,
    })
  }

  async addAgentInstruction(text: string): Promise<void> {
    const contents = await this.#findOrCreateFile(AGENT_INSTRUCTIONS_PATH)
    await this.writeFile(AGENT_INSTRUCTIONS_PATH, appendText(contents, text))
  }

  async addAgentSkill(
    name: string,
    description: string,
    contents: string,
    options: AgentSkillOptions = {},
  ): Promise<void> {
    assertValidSkillName(name)

    const skillDirectory = path.posix.join(SKILLS_DIR, name)
    const skillPath = path.posix.join(skillDirectory, 'SKILL.md')
    if (await this.exists(skillPath)) {
      throw new Error(`Agent skill with name "${name}" already exists`)
    }

    await this.runCommand('mkdir', ['-p', skillDirectory])
    await this.writeFile(skillPath, createSkillContents(name, description, contents))

    for (const file of options.files ?? []) {
      const destinationPath = path.posix.join(skillDirectory, getAgentSkillFileDestination(file))

      if (isWrittenFile(file)) {
        await this.runCommand('mkdir', ['-p', path.posix.dirname(destinationPath)])
        await this.writeFile(destinationPath, file.content)
      } else {
        await this.copy(file.sourcePath, destinationPath)
      }
    }
  }

  async addCustomAgent(
    name: string,
    description: string,
    contents: string,
    options: CustomAgentOptions = {},
  ): Promise<void> {
    assertValidCustomAgentName(name)

    const agentPath = path.posix.join(CUSTOM_AGENTS_DIR, `${name}.agent.md`)
    if (await this.exists(agentPath)) {
      throw new Error(`Custom agent with name "${name}" already exists`)
    }

    await this.runCommand('mkdir', ['-p', CUSTOM_AGENTS_DIR])
    await this.writeFile(agentPath, createCustomAgentContents(name, description, contents, options))

    for (const file of options.files ?? []) {
      const destinationPath = path.posix.join(CUSTOM_AGENTS_DIR, getCustomAgentFileDestination(file))

      if (isWrittenFile(file)) {
        await this.runCommand('mkdir', ['-p', path.posix.dirname(destinationPath)])
        await this.writeFile(destinationPath, file.content)
      } else {
        await this.copy(file.sourcePath, destinationPath)
      }
    }
  }

  async addMcpServer(name: string, config: McpServerConfig): Promise<void> {
    const contents = await this.readFile(MCP_CONFIG_PATH)
    const mcpConfig = contents === '' ? DEFAULT_MCP_CONFIG : McpConfigFileSchema.parse(JSON.parse(contents))
    if (mcpConfig.mcpServers[name]) {
      throw new Error(`MCP server with name "${name}" already exists`)
    }

    const updatedConfig: McpConfigFile = {
      ...mcpConfig,
      mcpServers: {
        ...mcpConfig.mcpServers,
        [name]: config,
      },
    }

    await this.writeFile(MCP_CONFIG_PATH, JSON.stringify(updatedConfig, null, 2))
    await this.runCommand('chown', ['-R', NODE_USER, MCP_CONFIG_PATH], {
      user: 'root',
    })
  }

  async addCopilotPlugin(config: CopilotPluginConfig): Promise<void> {
    if (config.type === 'marketplace') {
      const marketplaceSource = await this.#prepareCopilotPluginSource(config.marketplace.source)
      await this.runCommand('copilot', ['plugin', 'marketplace', 'add', marketplaceSource])
      await this.runCommand('copilot', ['plugin', 'install', `${config.name}@${config.marketplace.name}`])
      return
    }

    const source = await this.#prepareCopilotPluginSource(config)
    await this.runCommand('copilot', ['plugin', 'install', source])
  }

  async #prepareCopilotPluginSource(source: CopilotPluginSource): Promise<string> {
    if (source.type === 'remote') {
      return source.version ? `${source.url}#${source.version}` : source.url
    }

    const destinationPath = path.posix.join(COPILOT_PLUGIN_SOURCES_DIR, randomUUID())
    await this.copy(source.sourcePath, destinationPath)
    return destinationPath
  }

  async #findOrCreateFile(filepath: string): Promise<string> {
    if (await this.exists(filepath)) {
      return this.readFile(filepath)
    }

    await this.writeFile(filepath, '')
    return ''
  }
}

function mapCopiedHeader(header: Headers, sourceName: string, destinationName: string): Headers {
  const name =
    header.name === sourceName
      ? destinationName
      : path.posix.join(destinationName, header.name.slice(sourceName.length))

  return {
    ...header,
    name,
    uid: SANDBOX_UID,
    gid: SANDBOX_GID,
  }
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

function appendText(contents: string, text: string): string {
  const suffix = ensureTrailingNewline(text)
  if (contents.length === 0) {
    return suffix
  }

  if (contents.endsWith('\n')) {
    return `${contents}${suffix}`
  }

  return `${contents}\n${suffix}`
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`
}

function assertValidSkillName(name: string): void {
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    return
  }

  throw new Error(`Invalid agent skill name "${name}". Skill names must be lowercase and use hyphens for spaces.`)
}

function assertValidCustomAgentName(name: string): void {
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    return
  }

  throw new Error(
    `Invalid custom agent name "${name}". Custom agent names must be lowercase and use hyphens for spaces.`,
  )
}

function createSkillContents(name: string, description: string, contents: string): string {
  return `---
name: ${JSON.stringify(name)}
description: ${JSON.stringify(description)}
---

${ensureTrailingNewline(contents)}`
}

function createCustomAgentContents(
  name: string,
  description: string,
  contents: string,
  options: CustomAgentOptions,
): string {
  const tools = options.tools ? `tools: ${JSON.stringify(options.tools)}\n` : ''

  return `---
name: ${JSON.stringify(name)}
description: ${JSON.stringify(description)}
${tools}---

${ensureTrailingNewline(contents)}`
}

function getCustomAgentFileDestination(file: CustomAgentFile): string {
  return getAdditionalFileDestination(file, 'custom agent')
}

function getAgentSkillFileDestination(file: AgentSkillFile): string {
  return getAdditionalFileDestination(file, 'agent skill')
}

function getAdditionalFileDestination(file: CustomAgentFile | AgentSkillFile, fileKind: string): string {
  const destinationPath = isWrittenFile(file) ? file.path : (file.destinationPath ?? path.basename(file.sourcePath))
  const normalized = normalizeCopyPath(destinationPath)

  if (!normalized || path.posix.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`Invalid ${fileKind} file destination "${destinationPath}"`)
  }

  return normalized
}

function isWrittenFile(file: CustomAgentFile | AgentSkillFile): file is CustomAgentWrittenFile | AgentSkillWrittenFile {
  return 'content' in file
}

async function readFileFromArchive(archive: NodeJS.ReadableStream): Promise<Buffer> {
  const extract = tarStream.extract()

  return new Promise((resolve, reject) => {
    const chunks: Array<Buffer> = []

    extract.on('entry', (header, stream, next) => {
      if (header.type !== 'file') {
        stream.resume()
        next()
        return
      }

      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })

      stream.on('end', () => {
        resolve(Buffer.concat(chunks))
        next()
      })

      stream.on('error', reject)
    })

    extract.on('error', reject)
    archive.on('error', reject)

    archive.pipe(extract)
  })
}

class CommandError extends Error {
  command: ReadonlyArray<string>
  result: CommandResult

  constructor(command: ReadonlyArray<string>, result: CommandResult) {
    super(`Command failed with exit code ${result.exitCode}: ${command.join(' ')}`)
    this.name = 'CommandError'
    this.command = command
    this.result = result
  }
}

async function execCommand(
  container: RunningContainer,
  command: string,
  args: Array<string>,
  options: RunOptions,
): Promise<CommandResult> {
  const cmd = [command, ...args]
  const env = options.env ? Object.entries(options.env).map(([key, value]) => `${key}=${value}`) : undefined
  const result = await exec({
    container,
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: CONTAINER_WORKDIR,
    Env: env,
    User: options.user,
  })

  if (result.exitCode === 0 || options.allowNonZeroExitCode) {
    return result
  }

  throw new CommandError(cmd, result)
}

const SandboxSchema = z.custom<Sandbox>(value => {
  return value instanceof SystemSandbox || value instanceof VirtualSandbox
})

export {SandboxSchema, SystemSandbox, DEFAULT_DOCKER_IMAGE}
