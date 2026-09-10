import {createHash, randomUUID} from 'node:crypto'
import path from 'node:path'
import Docker from 'dockerode'
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
  MCP_CONFIG_PATH,
  NODE_USER,
  NPM_GLOBAL_DIR,
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
import {createCapturedStream} from './captured-stream'

const COPILOT_CLI_VERSION = '1.0.83'
const NPM_VERSION = '12.0.2'
const PREPARED_IMAGE_MEMORY_BYTES = 4 * 1024 * 1024 * 1024
const PREPARED_IMAGE_PIDS_LIMIT = 512
const DOCKERFILE = `ARG BASE_IMAGE=node:26.5.0-slim

FROM \${BASE_IMAGE} AS base

ARG NPM_VERSION
ARG COPILOT_CLI_VERSION

RUN apt-get update \\
  && apt-get install -y --no-install-recommends ca-certificates chromium curl git \\
  && rm -rf /var/lib/apt/lists/*

RUN npm install --global "npm@\${NPM_VERSION}"

RUN mkdir -p \\
    /home/sandbox/workspace \\
    /home/node/.npm-global \\
    /home/node/.copilot/agents \\
    /home/node/.agents/skills \\
  && chown -R node:node \\
    /home/sandbox \\
    /home/node/.npm-global \\
    /home/node/.copilot \\
    /home/node/.agents

USER node

RUN npm config set prefix /home/node/.npm-global \\
  && npm install --global "@github/copilot@\${COPILOT_CLI_VERSION}" \\
  && printf '%s\\n' '{"mcpServers":{}}' > /home/node/.copilot/mcp-config.json

ENV PATH="/home/node/.npm-global/bin:\${PATH}"

FROM base AS sandbox

WORKDIR /home/sandbox/workspace

CMD ["sleep", "infinity"]
`

const DEFAULT_MCP_CONFIG: McpConfigFile = {
  mcpServers: {},
}

class SystemSandbox implements Sandbox {
  static async create(options: SandboxCreateOptions = {}) {
    const docker = new Docker()
    const preparedImage = options.preparedImage?.trim()
    const network = options.network?.trim()
    if (options.preparedImage !== undefined && !preparedImage) {
      throw new Error('preparedImage must not be empty')
    }
    if (options.network !== undefined && !network) {
      throw new Error('network must not be empty')
    }
    if (network && !preparedImage) {
      throw new Error('network requires preparedImage')
    }
    if (preparedImage && options.dockerImage?.trim()) {
      throw new Error('preparedImage cannot be combined with dockerImage')
    }

    const dockerImage = preparedImage
      ? await resolvePreparedImage(docker, preparedImage)
      : await ensureDockerImage(docker, options.dockerImage?.trim() || DEFAULT_DOCKER_IMAGE)
    const container = await createContainer(docker, dockerImage, {
      hardened: Boolean(preparedImage),
      network,
    })
    return new SystemSandbox(options.host ?? DefaultHost, docker, container)
  }

  #container: Docker.Container
  #docker: Docker
  #host: Host

  constructor(host: Host, docker: Docker, container: InitializedContainer) {
    this.#host = host
    this.#docker = docker
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
    const containerPath = resolveContainerPath(containerFilePath)
    const archive = await this.#container.getArchive({
      path: containerPath,
    })
    await extractArchiveToHost(archive, path.posix.basename(containerPath), hostDestinationPath, options, this.#host)
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
    logger.debug('[sandbox] Running command: %s %s', command, args.join(' '))
    return execCommand(this.#docker, this.#container, command, args, {
      env: {
        HOME: options?.user === 'root' ? '/root' : '/home/node',
        ...options?.env,
        PATH: `${NPM_GLOBAL_DIR}/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
      },
      user: options?.user ?? NODE_USER,
      allowNonZeroExitCode: options?.allowNonZeroExitCode,
      onStdout: options?.onStdout,
      onStderr: options?.onStderr,
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

const INITIALIZED_CONTAINER: unique symbol = Symbol('InitializedContainer')

const DEFAULT_DOCKER_IMAGE = 'node:26.5.0-slim'
const activeContainers = new Set<Docker.Container>()
const containerRemovals = new WeakMap<Docker.Container, Promise<void>>()
const removedContainers = new WeakSet<Docker.Container>()
const dockerImageBuilds = new Map<string, Promise<string>>()
let terminationCleanup: Promise<void> | undefined

type TerminationSignal = 'SIGINT' | 'SIGTERM'

const terminationHandlers: Record<TerminationSignal, () => void> = {
  SIGINT() {
    handleTermination('SIGINT')
  },
  SIGTERM() {
    handleTermination('SIGTERM')
  },
}

type InitializedContainer = Docker.Container & {
  readonly [INITIALIZED_CONTAINER]?: true
}

async function ensureDockerImage(docker: Docker, baseDockerImage: string): Promise<string> {
  let build = dockerImageBuilds.get(baseDockerImage)
  if (!build) {
    build = buildDockerImage(docker, baseDockerImage).catch(error => {
      dockerImageBuilds.delete(baseDockerImage)
      throw error
    })
    dockerImageBuilds.set(baseDockerImage, build)
  }

  return build
}

async function buildDockerImage(docker: Docker, baseDockerImage: string): Promise<string> {
  const dockerImage = getDockerImageName(baseDockerImage)
  logger.debug('Building sandbox image %s from %s...', dockerImage, baseDockerImage)
  let builtImageId: string | undefined

  const dockerfile = Buffer.from(DOCKERFILE)
  const context = tarStream.pack()
  context.entry(
    {
      name: 'Dockerfile',
      size: dockerfile.byteLength,
    },
    dockerfile,
  )
  context.finalize()

  const stream = await docker.buildImage(context, {
    buildargs: {
      BASE_IMAGE: baseDockerImage,
      COPILOT_CLI_VERSION,
      NPM_VERSION,
    },
    dockerfile: 'Dockerfile',
    t: dockerImage,
    target: 'sandbox',
  })

  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(
      stream,
      error => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      },
      event => {
        if (
          typeof event === 'object' &&
          event !== null &&
          'aux' in event &&
          typeof event.aux === 'object' &&
          event.aux !== null &&
          'ID' in event.aux &&
          typeof event.aux.ID === 'string'
        ) {
          builtImageId = event.aux.ID
        }
      },
    )
  })

  try {
    await docker.getImage(dockerImage).inspect()
  } catch (error) {
    if (!builtImageId) {
      throw new Error(`Docker build completed without creating image tag: ${dockerImage}`, {
        cause: error,
      })
    }

    const separator = dockerImage.lastIndexOf(':')
    await docker.getImage(builtImageId).tag({
      repo: dockerImage.slice(0, separator),
      tag: dockerImage.slice(separator + 1),
    })
    await docker.getImage(dockerImage).inspect()
  }

  return dockerImage
}

async function resolvePreparedImage(docker: Docker, image: string): Promise<string> {
  assertImmutableImageReference(image)

  try {
    await docker.getImage(image).inspect()
  } catch (error) {
    throw new Error(`Prepared image does not exist locally: ${image}`, {
      cause: error,
    })
  }

  return image
}

function assertImmutableImageReference(image: string): void {
  if (/^sha256:[a-f0-9]{64}$/i.test(image)) {
    return
  }

  const repositoryDigestPattern =
    /^(?:[a-z0-9]+(?:[.-][a-z0-9]+)*(?::[0-9]+)?\/)?[a-z0-9]+(?:[._/-][a-z0-9]+)*@sha256:[a-f0-9]{64}$/i
  if (!repositoryDigestPattern.test(image)) {
    throw new Error('preparedImage must be a local sha256 image ID or repository digest without a mutable tag')
  }
}

function getDockerImageName(baseDockerImage: string, dockerfile = DOCKERFILE): string {
  const digest = createHash('sha256')
    .update(baseDockerImage)
    .update('\0')
    .update(dockerfile)
    .update('\0')
    .update(NPM_VERSION)
    .update('\0')
    .update(COPILOT_CLI_VERSION)
    .digest('hex')
    .slice(0, 16)

  return `agent-eval-sandbox:${digest}`
}

async function createContainer(
  docker: Docker,
  dockerImage: string,
  options: {
    hardened?: boolean
    network?: string
  } = {},
): Promise<InitializedContainer> {
  const hostConfig: Docker.HostConfig = {
    AutoRemove: true,
  }
  if (options.hardened) {
    Object.assign(hostConfig, {
      CapAdd: ['CHOWN'],
      CapDrop: ['ALL'],
      Memory: PREPARED_IMAGE_MEMORY_BYTES,
      PidsLimit: PREPARED_IMAGE_PIDS_LIMIT,
      SecurityOpt: ['no-new-privileges'],
    })
  }
  if (options.network) {
    hostConfig.NetworkMode = options.network
  }

  const container = await docker.createContainer({
    Image: dockerImage,
    Cmd: ['sleep', 'infinity'],
    WorkingDir: CONTAINER_WORKDIR,
    Tty: true,
    HostConfig: hostConfig,
  })

  try {
    await container.start()
    trackContainer(container)
    return container as InitializedContainer
  } catch (error) {
    try {
      await container.remove({force: true})
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Failed to initialize and remove sandbox container', {
        cause: cleanupError,
      })
    }
    throw error
  }
}

function trackContainer(container: Docker.Container): void {
  activeContainers.add(container)
  if (activeContainers.size !== 1) {
    return
  }

  process.once('SIGINT', terminationHandlers.SIGINT)
  process.once('SIGTERM', terminationHandlers.SIGTERM)
}

async function removeContainer(container: Docker.Container): Promise<void> {
  if (removedContainers.has(container)) {
    return
  }

  const activeRemoval = containerRemovals.get(container)
  if (activeRemoval) {
    return activeRemoval
  }

  const removal = (async () => {
    try {
      await container.remove({force: true})
    } catch (error) {
      if (!isDockerNotFoundError(error)) {
        throw error
      }
    }

    removedContainers.add(container)
    activeContainers.delete(container)

    if (activeContainers.size === 0) {
      process.off('SIGINT', terminationHandlers.SIGINT)
      process.off('SIGTERM', terminationHandlers.SIGTERM)
    }
  })().finally(() => {
    containerRemovals.delete(container)
  })
  containerRemovals.set(container, removal)
  return removal
}

function isDockerNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'statusCode' in error && error.statusCode === 404
}

async function cleanupActiveContainers(): Promise<void> {
  const results = await Promise.allSettled(Array.from(activeContainers, container => removeContainer(container)))
  const errors = results.flatMap(result => {
    if (result.status === 'rejected') {
      return [result.reason]
    }

    return []
  })

  if (errors.length > 0) {
    throw new AggregateError(errors, 'Failed to remove active sandbox containers')
  }
}

function handleTermination(signal: TerminationSignal): void {
  terminationCleanup ??= cleanupActiveContainers()
    .catch(error => {
      logger.error({error}, 'Failed to clean up sandbox containers during termination')
    })
    .then(() => {
      process.exit(signal === 'SIGINT' ? 130 : 143)
    })
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

async function extractArchiveToHost(
  archive: NodeJS.ReadableStream,
  sourceName: string,
  hostDestinationPath: string,
  options: DownloadOptions,
  host: Host,
): Promise<void> {
  const destinationRoot = path.resolve(hostDestinationPath)
  await host.fs.mkdir(destinationRoot, {
    recursive: true,
  })

  const extract = tarStream.extract()
  await new Promise<void>((resolve, reject) => {
    extract.on('entry', (header, stream, next) => {
      void (async () => {
        const relativePath = getDownloadedRelativePath(header, sourceName)
        if (options.ignore?.(relativePath)) {
          stream.resume()
          return
        }

        const destination = resolveDownloadDestination(destinationRoot, relativePath)
        await assertDownloadAncestors(host, destinationRoot, destination)
        if (header.type === 'directory') {
          stream.resume()
          if ((await downloadStats(host, destination))?.isSymbolicLink()) {
            throw new Error(`Cannot extract directory through a symbolic link: ${relativePath}`)
          }
          await host.fs.mkdir(destination, {recursive: true})
          return
        }

        if (header.type === 'file') {
          const contents = await readStream(stream)
          const transformed = options.transform?.(contents, relativePath) ?? contents
          await host.fs.mkdir(path.dirname(destination), {recursive: true})
          if ((await downloadStats(host, destination))?.isSymbolicLink()) {
            await host.fs.unlink(destination)
          }
          await host.fs.writeFile(destination, transformed)
          return
        }

        if (header.type === 'symlink') {
          stream.resume()
          const target = resolveDownloadDestination(
            destinationRoot,
            path.relative(destinationRoot, path.resolve(path.dirname(destination), header.linkname ?? '')),
          )
          await assertDownloadAncestors(host, destinationRoot, target)
          if ((await downloadStats(host, target))?.isSymbolicLink()) {
            throw new Error(`Cannot extract a symbolic link chain: ${relativePath}`)
          }
          await host.fs.mkdir(path.dirname(destination), {recursive: true})
          await host.fs.rm(destination, {force: true})
          await host.fs.symlink(header.linkname ?? '', destination)
          return
        }

        stream.resume()
        throw new Error(`Unsupported download archive entry: ${relativePath} (${header.type})`)
      })().then(
        () => {
          next()
        },
        error => {
          extract.destroy(error as Error)
        },
      )
    })
    extract.on('finish', resolve)
    extract.on('error', reject)
    archive.on('error', reject)
    archive.pipe(extract)
  })
}

async function downloadStats(host: Host, filepath: string) {
  try {
    return await host.fs.lstat(filepath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

async function assertDownloadAncestors(host: Host, root: string, destination: string): Promise<void> {
  const relativeParent = destination === root ? '' : path.relative(root, path.dirname(destination))
  let directory = root
  for (const segment of ['', ...relativeParent.split(path.sep).filter(Boolean)]) {
    directory = segment ? path.join(directory, segment) : directory
    const stats = await downloadStats(host, directory)
    if (stats?.isSymbolicLink()) throw new Error(`Cannot extract through a symbolic link: ${directory}`)
  }
}

function getDownloadedRelativePath(header: tarStream.Headers, sourceName: string): string {
  if (header.name === sourceName) {
    return header.type === 'directory' ? '.' : sourceName
  }

  const prefix = `${sourceName}/`
  return header.name.startsWith(prefix) ? header.name.slice(prefix.length) : header.name
}

function resolveDownloadDestination(destinationRoot: string, relativePath: string): string {
  const destination = path.resolve(destinationRoot, relativePath)
  const relative = path.relative(destinationRoot, destination)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Cannot download archive path outside the destination: ${relativePath}`)
  }
  return destination
}

async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Array<Buffer> = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
  }
  return Buffer.concat(chunks)
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
    const stdout = createCapturedStream(line => {
      logger.debug('[sandbox]: %s', line)
    }, options.onStdout)
    const stderr = createCapturedStream(line => {
      logger.debug('[sandbox]: %s', line)
    }, options.onStderr)

    docker.modem.demuxStream(stream, stdout.stream, stderr.stream)

    stream.on('end', async () => {
      try {
        stdout.flush()
        stderr.flush()

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
    stream.on('error', error => {
      stdout.flush()
      stderr.flush()
      reject(error)
    })
  })
}

const SandboxSchema = z.custom<Sandbox>(value => {
  return value instanceof SystemSandbox || value instanceof VirtualSandbox
})

export {
  SandboxSchema,
  SystemSandbox,
  DEFAULT_DOCKER_IMAGE,
  buildDockerImage,
  cleanupActiveContainers,
  createContainer,
  getDockerImageName,
  resolvePreparedImage,
}
