import {PassThrough} from 'node:stream'
import Docker from 'dockerode'
import tarStream from 'tar-stream'
import {logger} from './logger'
import {createHash} from 'node:crypto'
import {withDeadline} from './deadline'
import {containerLabels, isRecoverableContainer, parseRunId, recoveryFilters} from './container-ownership'

const docker = new Docker()
const CLEANUP_TIMEOUT_MS = 30_000

type ImageBuildOptions = Omit<Docker.ImageBuildOptions, 't'> & {t: string}

const IMAGE_BUILD: unique symbol = Symbol('IMAGE_BUILD')
type ImageBuild = {
  tagName: string
  readonly [IMAGE_BUILD]?: true
}

async function buildImage(context: NodeJS.ReadableStream, options: ImageBuildOptions): Promise<ImageBuild> {
  const stream = await docker.buildImage(context, options)

  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(
      stream,
      error => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      },
      event => {
        if (event.stream) {
          // Trim trailing newlines
          const message = event.stream.replace(/[\r\n]+$/, '')
          if (message) {
            logger.debug('[docker] %s', message)
          }
        }
      },
    )
  })

  return {
    tagName: options.t,
  }
}

async function buildImageFromDockerfile(dockerfile: string, options: ImageBuildOptions): Promise<ImageBuild> {
  const contents = Buffer.from(dockerfile)
  const context = tarStream.pack()
  context.entry(
    {
      name: 'Dockerfile',
      size: contents.byteLength,
    },
    contents,
  )
  context.finalize()

  return await buildImage(context, {
    ...options,
    dockerfile: 'Dockerfile',
  })
}

type GetImageTagOptions = {
  dockerfile: string
  context?: string
  buildargs?: Record<string, string | undefined>
  files?: Record<string, string | Buffer | undefined>
}

function getImageTag({dockerfile, context, buildargs, files}: GetImageTagOptions): string {
  const hash = createHash('sha256')

  hash.update(dockerfile).update('\0')

  if (context !== undefined) {
    hash.update(context).update('\0')
  }

  if (buildargs) {
    for (const [key, value] of Object.entries(buildargs).sort(([a], [b]) => a.localeCompare(b))) {
      if (value === undefined) {
        continue
      }

      hash.update(key).update('\0').update(value).update('\0')
    }
  }

  if (files) {
    for (const [path, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
      if (content === undefined) {
        continue
      }

      hash.update(path).update('\0').update(content).update('\0')
    }
  }

  return hash.digest('hex').slice(0, 16)
}

type GetImageReferenceOptions = GetImageTagOptions & {
  name: string
}

function getImageReference({name, ...rest}: GetImageReferenceOptions) {
  const tag = getImageTag(rest)
  return `${name}:${tag}`
}

const activeContainers = new Set<Docker.Container>()
type ContainerState =
  | {type: 'active'}
  | {type: 'removing'; promise: Promise<void>}
  | {type: 'removed'}
  | {type: 'cleanup-unresolved'; error: unknown}
const containerStates = new WeakMap<Docker.Container, ContainerState>()

function trackContainer(container: Docker.Container) {
  if (activeContainers.size === 0) {
    process.once('SIGINT', terminationHandlers.SIGINT)
    process.once('SIGTERM', terminationHandlers.SIGTERM)
  }

  activeContainers.add(container)
  containerStates.set(container, {type: 'active'})
}

async function cleanupActiveContainers() {
  const results = await Promise.allSettled(
    Array.from(activeContainers).map(async container => {
      return await removeContainer(container)
    }),
  )

  const errors = results.flatMap(result => {
    if (result.status === 'rejected') {
      return result.reason
    }
    return []
  })

  if (errors.length > 0) {
    throw new AggregateError(errors, 'Failed to clean up containers')
  }
}

async function removeContainer(container: Docker.Container) {
  const state = containerStates.get(container)
  if (state?.type === 'removed') {
    return
  }

  if (state?.type === 'removing') {
    return state.promise
  }

  const remove = async () => {
    try {
      await withDeadline(
        async abortSignal => {
          await container.remove({force: true, abortSignal})
        },
        {timeoutMs: CLEANUP_TIMEOUT_MS, description: `Removing container "${container.id}"`},
      )
    } catch (error) {
      if (!isDockerNotFoundError(error)) {
        containerStates.set(container, {type: 'cleanup-unresolved', error})
        throw error
      }
    }
    containerStates.set(container, {type: 'removed'})
    activeContainers.delete(container)

    if (activeContainers.size === 0) {
      process.removeListener('SIGINT', terminationHandlers.SIGINT)
      process.removeListener('SIGTERM', terminationHandlers.SIGTERM)
    }
  }
  const promise = remove()

  containerStates.set(container, {type: 'removing', promise})

  return promise
}

function isDockerNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'statusCode' in error && error.statusCode === 404
}

const terminationHandlers = {
  SIGINT: () => {
    cleanupActiveContainers()
      .catch(error => {
        logger.error({err: error}, 'Failed to clean up containers during termination')
      })
      .finally(() => {
        process.exit(130)
      })
  },
  SIGTERM: () => {
    cleanupActiveContainers()
      .catch(error => {
        logger.error({err: error}, 'Failed to clean up containers during termination')
      })
      .finally(() => {
        process.exit(143)
      })
  },
}

type CreateContainerOptions = Omit<Docker.ContainerCreateOptions, 'Image'> & {
  image: ImageBuild
  runId?: string
  trialId?: string
}

const RUNNING_CONTAINER: unique symbol = Symbol('RUNNING_CONTAINER')

type RunningContainer = Docker.Container & {
  readonly [RUNNING_CONTAINER]: true
}

async function createContainer({image, runId, trialId, ...rest}: CreateContainerOptions): Promise<RunningContainer> {
  const container = await docker.createContainer({
    Image: image.tagName,
    Cmd: ['sleep', 'infinity'],
    Tty: true,
    ...rest,
    Labels: {
      ...rest.Labels,
      ...containerLabels(runId, trialId),
    },
    HostConfig: {
      AutoRemove: true,
      ...rest.HostConfig,
    },
  })

  trackContainer(container)
  try {
    await container.start()
    return container as RunningContainer
  } catch (error) {
    try {
      await removeContainer(container)
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Failed to initialize and remove container', {
        cause: cleanupError,
      })
    }
    throw error
  }
}

async function recoverContainers(input: unknown): Promise<{removed: Array<string>; skipped: Array<string>}> {
  const runId = parseRunId(input)
  const containers = await withDeadline(
    async abortSignal => {
      return docker.listContainers({all: true, filters: {label: recoveryFilters(runId)}, abortSignal})
    },
    {timeoutMs: CLEANUP_TIMEOUT_MS, description: `Listing containers for run "${runId}"`},
  )
  const removed: Array<string> = []
  const skipped: Array<string> = []
  const errors: Array<Error> = []
  for (const container of containers) {
    try {
      if (!isRecoverableContainer(container.Labels, runId)) {
        skipped.push(container.Id)
        logger.warn(
          {containerId: container.Id, runId},
          'Skipping container whose inactive ownership could not be confirmed',
        )
        continue
      }
      await removeContainer(docker.getContainer(container.Id))
      removed.push(container.Id)
      logger.info({containerId: container.Id, runId}, 'Removed leftover container')
    } catch (cause) {
      const error = new Error(`Failed to recover container "${container.Id}"`, {cause})
      errors.push(error)
      logger.error({err: error, containerId: container.Id, runId}, 'Container recovery failed')
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Some containers could not be recovered')
  }
  return {removed, skipped}
}

type CommandResult = {
  stdout: string
  stderr: string
  exitCode: number
}

type ExecOptions = Docker.ExecCreateOptions & {
  container: RunningContainer
}

async function exec({container, ...rest}: ExecOptions): Promise<CommandResult> {
  const exec = await container.exec({
    ...rest,
    AttachStdout: true,
    AttachStderr: true,
  })
  const stream = await exec.start({
    hijack: true,
    stdin: false,
  })
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  let capturedStdout = ''
  let capturedStderr = ''

  stdout.setEncoding('utf8').on('data', (text: string) => {
    // Trim trailing newlines
    logger.debug('[exec] %s', text.replace(/[\r\n]+$/, ''))
    capturedStdout += text
  })

  stderr.setEncoding('utf8').on('data', (text: string) => {
    // Trim trailing newlines
    logger.debug('[exec] %s', text.replace(/[\r\n]+$/, ''))
    capturedStderr += text
  })

  docker.modem.demuxStream(stream, stdout, stderr)

  return new Promise((resolve, reject) => {
    stream.on('end', async () => {
      stdout.end()
      stderr.end()

      try {
        const inspectInfo = await exec.inspect()
        const exitCode = inspectInfo.ExitCode ?? 0
        const result = {
          stdout: capturedStdout,
          stderr: capturedStderr,
          exitCode,
        }

        resolve(result)
      } catch (error) {
        reject(error)
      }
    })

    stream.on('error', error => {
      stdout.end()
      stderr.end()
      reject(error)
    })
  })
}

export {
  createContainer,
  removeContainer,
  recoverContainers,
  buildImage,
  buildImageFromDockerfile,
  exec,
  getImageTag,
  getImageReference,
}
export type {ImageBuild, RunningContainer}
