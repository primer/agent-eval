import {PassThrough} from 'node:stream'
import Docker from 'dockerode'
import tarStream from 'tar-stream'
import {logger} from './logger'
import {createHash} from 'node:crypto'

const docker = new Docker()

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
  buildargs?: Record<string, string | undefined>
  files?: Record<string, string | Buffer | undefined>
}

function getImageTag({dockerfile, buildargs, files}: GetImageTagOptions): string {
  const hash = createHash('sha256')

  hash.update(dockerfile).update('\0')

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

const activeContainers = new Set<RunningContainer>()
const removedContainers = new WeakSet<Docker.Container>()
const pendingRemovals = new WeakMap()

function trackContainer(container: RunningContainer) {
  if (activeContainers.size === 0) {
    process.once('SIGINT', terminationHandlers.SIGINT)
    process.once('SIGTERM', terminationHandlers.SIGTERM)
  }

  activeContainers.add(container)
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

async function removeContainer(container: RunningContainer) {
  if (removedContainers.has(container)) {
    return
  }

  const pending = pendingRemovals.get(container)
  if (pending) {
    return pending
  }

  const remove = async () => {
    try {
      await container.remove({
        force: true,
      })
    } catch (error) {
      if (!isDockerNotFoundError(error)) {
        throw error
      }
    } finally {
      removedContainers.add(container)
      activeContainers.delete(container)

      if (activeContainers.size === 0) {
        process.removeListener('SIGINT', terminationHandlers.SIGINT)
        process.removeListener('SIGTERM', terminationHandlers.SIGTERM)
      }
    }
  }
  const promise = remove().finally(() => {
    pendingRemovals.delete(container)
  })

  pendingRemovals.set(container, promise)

  return promise
}

function isDockerNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'statusCode' in error && error.statusCode === 404
}

const terminationHandlers = {
  SIGINT: () => {
    cleanupActiveContainers()
      .catch(error => {
        logger.error({error}, 'Failed to clean up containers during termination')
      })
      .finally(() => {
        process.exit(130)
      })
  },
  SIGTERM: () => {
    cleanupActiveContainers()
      .catch(error => {
        logger.error({error}, 'Failed to clean up containers during termination')
      })
      .finally(() => {
        process.exit(143)
      })
  },
}

type CreateContainerOptions = Omit<Docker.ContainerCreateOptions, 'Image'> & {
  image: ImageBuild
}

const RUNNING_CONTAINER: unique symbol = Symbol('RUNNING_CONTAINER')

type RunningContainer = Docker.Container & {
  readonly [RUNNING_CONTAINER]: true
}

async function createContainer({image, ...rest}: CreateContainerOptions): Promise<RunningContainer> {
  const container = await docker.createContainer({
    Image: image.tagName,
    Cmd: ['sleep', 'infinity'],
    Tty: true,
    ...rest,
    HostConfig: {
      AutoRemove: true,
      ...rest.HostConfig,
    },
  })

  try {
    await container.start()
    trackContainer(container as RunningContainer)
    return container as RunningContainer
  } catch (error) {
    try {
      await container.remove({
        force: true,
      })
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Failed to initialize and remove container', {
        cause: cleanupError,
      })
    }
    throw error
  }
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

export {createContainer, removeContainer, buildImage, buildImageFromDockerfile, exec, getImageTag, getImageReference}
export type {ImageBuild, RunningContainer}
