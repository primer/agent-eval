import fs from 'node:fs/promises'
import path from 'node:path'
import {Writable} from 'node:stream'
import {pipeline} from 'node:stream/promises'
import Docker from 'dockerode'
import tarFs from 'tar-fs'
import type {Headers} from 'tar-fs'
import tarStream from 'tar-stream'
import {McpConfigFileSchema} from './mcp-config.ts'
import type {McpConfigFile, McpServerConfig} from './mcp-config.ts'

/**
 * Working directory inside the container.
 */
const CONTAINER_WORKDIR = '/home/sandbox/workspace'

/**
 * Directory for copilot cli configuration.
 */
const COPILOT_DIR = '/home/node/.copilot'

/**
 * Directory for agents configuration and skills.
 */
const AGENTS_DIR = '/home/node/.agents'

/**
 * Directory for skills.
 */
const SKILLS_DIR = '/home/node/.agents/skills'

/**
 * Path for project agent instructions.
 */
const AGENT_INSTRUCTIONS_PATH = path.posix.join(CONTAINER_WORKDIR, 'AGENTS.md')

/**
 * Path for MCP server configuration file.
 */
const MCP_CONFIG_PATH = path.join(COPILOT_DIR, 'mcp-config.json')

/**
 * Non-root user configuration.
 * Running as non-root is important for security and compatibility
 * (e.g., Claude Code refuses --dangerously-skip-permissions as root).
 * Node.js images already have a 'node' user with UID/GID 1000.
 */
const SANDBOX_UID = 1000
const SANDBOX_GID = 1000
const NODE_USER = `${SANDBOX_UID}:${SANDBOX_GID}` as const

/**
 * Directory for npm global packages (non-root install location).
 */
const NPM_GLOBAL_DIR = '/home/node/.npm-global'

type RunOptions = {
  env?: Record<string, string>
  user?: string
  allowNonZeroExitCode?: boolean
}

type CopyOptions = {
  exclude?: string[]
}

type DownloadOptions = {
  ignore?: (name: string) => boolean
}

type SandboxCreateOptions = {
  dockerImage?: string
}

const DEFAULT_MCP_CONFIG: McpConfigFile = {
  mcpServers: {},
}

class Sandbox {
  static async create(options: SandboxCreateOptions = {}) {
    const docker = new Docker()
    const dockerImage = options.dockerImage?.trim() || DEFAULT_DOCKER_IMAGE
    const container = await createContainer(docker, dockerImage)
    return new Sandbox(docker, container)
  }

  #docker: Docker
  #container: Docker.Container

  constructor(docker: Docker, container: InitializedContainer) {
    this.#docker = docker
    this.#container = container
  }

  async [Symbol.asyncDispose]() {
    await this.#container.stop()
  }

  async copy(sourcePath: string, destinationPath: string, options: CopyOptions = {}): Promise<void> {
    const source = path.resolve(sourcePath)
    const sourceStats = await fs.stat(source)
    if (!sourceStats.isDirectory() && !sourceStats.isFile()) {
      throw new Error(`Cannot copy "${sourcePath}" because it is not a file or directory`)
    }

    const containerPath = resolveContainerPath(destinationPath)
    const containerDirectory = path.posix.dirname(containerPath)
    const destinationName = path.posix.basename(containerPath)
    if (!destinationName) {
      throw new Error(`Cannot copy "${sourcePath}" to "${destinationPath}" because the destination must include a name`)
    }

    await execCommand(this.#docker, this.#container, 'mkdir', ['-p', containerDirectory], {
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
    await fs.mkdir(hostDestinationPath, {
      recursive: true,
    })

    const archive = await this.#container.getArchive({
      path: containerFilePath,
    })
    const sourceName = path.posix.basename(containerFilePath)

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
    const result = await execCommand(this.#docker, this.#container, 'test', ['-e', resolveContainerPath(filepath)], {
      user: NODE_USER,
      allowNonZeroExitCode: true,
    })

    return result.exitCode === 0
  }

  async runCommand(command: string, args: Array<string> = [], options?: RunOptions): Promise<CommandResult> {
    return execCommand(this.#docker, this.#container, command, args, {
      env: {
        HOME: options?.user === 'root' ? '/root' : '/home/node',
        ...options?.env,
        PATH: `${NPM_GLOBAL_DIR}/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
      },
      user: options?.user ?? NODE_USER,
      allowNonZeroExitCode: options?.allowNonZeroExitCode,
    })
  }

  async addAgentInstruction(text: string): Promise<void> {
    const contents = await this.#findOrCreateFile(AGENT_INSTRUCTIONS_PATH)
    await this.writeFile(AGENT_INSTRUCTIONS_PATH, appendText(contents, text))
  }

  async addAgentSkill(name: string, description: string, contents: string): Promise<void> {
    assertValidSkillName(name)

    const skillDirectory = path.posix.join(SKILLS_DIR, name)
    const skillPath = path.posix.join(skillDirectory, 'SKILL.md')
    if (await this.exists(skillPath)) {
      throw new Error(`Agent skill with name "${name}" already exists`)
    }

    await this.runCommand('mkdir', ['-p', skillDirectory])
    await this.writeFile(skillPath, createSkillContents(name, description, contents))
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

  async #findOrCreateFile(filepath: string): Promise<string> {
    if (await this.exists(filepath)) {
      return this.readFile(filepath)
    }

    await this.writeFile(filepath, '')
    return ''
  }
}

const INITIALIZED_CONTAINER: unique symbol = Symbol('InitializedContainer')

const DEFAULT_DOCKER_IMAGE = 'node:26-slim'

type InitializedContainer = Docker.Container & {
  readonly [INITIALIZED_CONTAINER]?: true
}

async function createContainer(docker: Docker, dockerImage: string): Promise<InitializedContainer> {
  await pullImage(docker, dockerImage)

  const container = await docker.createContainer({
    Image: dockerImage,
    Cmd: ['sleep', 'infinity'],
    WorkingDir: CONTAINER_WORKDIR,
    Tty: true,
    HostConfig: {
      AutoRemove: true,
    },
  })

  await container.start()

  console.log('Creating workspace directory...')
  await execCommand(docker, container, 'mkdir', ['-p', CONTAINER_WORKDIR], {
    user: 'root',
  })
  await execCommand(docker, container, 'chown', ['-R', NODE_USER, CONTAINER_WORKDIR], {
    user: 'root',
  })

  console.log('Installing CA certificates...')
  await execCommand(docker, container, 'apt-get', ['update'], {
    user: 'root',
  })
  await execCommand(docker, container, 'apt-get', ['install', '-y', '--no-install-recommends', 'ca-certificates'], {
    user: 'root',
  })
  await execCommand(docker, container, 'test', ['-d', '/etc/ssl/certs'], {
    user: 'root',
  })

  console.log('Setting up npm for non-root global installs')
  await execCommand(docker, container, 'mkdir', ['-p', NPM_GLOBAL_DIR], {
    user: 'root',
  })
  await execCommand(docker, container, 'chown', ['-R', NODE_USER, NPM_GLOBAL_DIR], {
    user: 'root',
  })
  await execCommand(docker, container, 'npm', ['config', 'set', 'prefix', NPM_GLOBAL_DIR], {
    user: NODE_USER,
  })

  console.log('Setting up copilot...')
  await execCommand(docker, container, 'mkdir', ['-p', COPILOT_DIR], {
    user: 'root',
  })
  await execCommand(docker, container, 'chown', ['-R', NODE_USER, COPILOT_DIR], {
    user: 'root',
  })
  await execCommand(docker, container, 'npm', ['install', '-g', '@github/copilot'], {
    user: NODE_USER,
  })
  await execCommand(docker, container, 'touch', [path.join(COPILOT_DIR, 'mcp-config.json')], {
    user: NODE_USER,
  })

  console.log('Setting up agents config...')
  await execCommand(docker, container, 'mkdir', ['-p', AGENTS_DIR], {
    user: 'root',
  })
  await execCommand(docker, container, 'chown', ['-R', NODE_USER, AGENTS_DIR], {
    user: 'root',
  })

  return container as InitializedContainer
}

function resolveContainerPath(filepath: string): string {
  if (path.posix.isAbsolute(filepath)) {
    return filepath
  }

  return path.posix.join(CONTAINER_WORKDIR, filepath)
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

function createSkillContents(name: string, description: string, contents: string): string {
  return `---
name: ${JSON.stringify(name)}
description: ${JSON.stringify(description)}
---

${ensureTrailingNewline(contents)}`
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

function pullImage(docker: Docker, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    docker.pull(name, (error: Error | null, stream: NodeJS.ReadableStream) => {
      if (error) {
        reject(error)
        return
      }

      // Follow the pull progress
      docker.modem.followProgress(
        stream,
        (progressError: Error | null) => {
          if (progressError) {
            reject(progressError)
          } else {
            resolve()
          }
        },
        () => {},
      )
    })
  })
}

type CommandResult = {
  stdout: string
  stderr: string
  exitCode: number
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
  docker: Docker,
  container: Docker.Container,
  command: string,
  args: Array<string>,
  options: RunOptions,
): Promise<CommandResult> {
  const cmd = [command, ...args]
  const env = options.env ? Object.entries(options.env).map(([key, value]) => `${key}=${value}`) : undefined
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: CONTAINER_WORKDIR,
    Env: env,
    User: options.user,
  })

  const stream = await exec.start({
    hijack: true,
    stdin: false,
  })

  return new Promise((resolve, reject) => {
    const stdout = captureStream(process.stdout)
    const stderr = captureStream(process.stderr)

    docker.modem.demuxStream(stream, stdout.stream, stderr.stream)

    stream.on('end', async () => {
      try {
        const inspectInfo = await exec.inspect()
        const exitCode = inspectInfo.ExitCode ?? 0
        const result = {
          stdout: stdout.read(),
          stderr: stderr.read(),
          exitCode,
        }

        if (exitCode === 0 || options.allowNonZeroExitCode) {
          resolve(result)
          return
        }

        reject(new CommandError(cmd, result))
      } catch (error) {
        reject(error)
      }
    })
    stream.on('error', reject)
  })
}

function captureStream(destination: NodeJS.WritableStream): {stream: Writable; read(): string} {
  const chunks: Array<Buffer> = []
  const stream = new Writable({
    write(chunk: Buffer | string, encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding)
      chunks.push(buffer)
      destination.write(buffer)
      callback()
    },
  })

  return {
    stream,
    read() {
      return Buffer.concat(chunks).toString('utf8')
    },
  }
}

export {CONTAINER_WORKDIR, COPILOT_DIR, SKILLS_DIR, AGENTS_DIR, NODE_USER, Sandbox}
