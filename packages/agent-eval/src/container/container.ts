import {PassThrough} from 'node:stream'
import type Docker from 'dockerode'
import type {Client} from './client'
import type {ContainerImage} from './image'
import {Newtype} from '../newtype'
import {debug} from '../logger'

type CreateContainerOptions = Omit<Docker.ContainerCreateOptions, 'Image'> & {
  client: Client
  image: ContainerImage
}

class Container extends Newtype<'Container', Docker.Container> {
  static async create({client, image, ...rest}: CreateContainerOptions) {
    const container = await client.createContainer({
      Image: image.unwrap(),
      Cmd: ['sleep', 'infinity'],
      Tty: true,
      ...rest,
      HostConfig: {
        AutoRemove: true,
        ...rest.HostConfig,
      },
    })
    return new Container(container)
  }

  start() {
    return this.unwrap().start()
  }

  remove() {
    return this.unwrap().remove({
      force: true,
    })
  }
}

class RunningContainer extends Newtype<'RunningContainer', Container> {
  #client: Client

  protected constructor(client: Client, container: Container) {
    super(container)
    this.#client = client
  }

  static async start(client: Client, container: Container): Promise<RunningContainer> {
    try {
      await container.start()
      return new RunningContainer(client, container)
    } catch (error) {
      try {
        await container.remove()
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Failed to initialize and remove container', {
          cause: cleanupError,
        })
      }

      throw error
    }
  }

  async [Symbol.asyncDispose]() {
    try {
      await this.stop()
    } catch (error) {
      if (!isDockerNotFoundError(error)) {
        throw error
      }
    }
  }

  async exec(options: ExecCreateOptions): Promise<CommandResult> {
    const containerType = this.unwrap()
    const container = containerType.unwrap()
    const exec = await container.exec({
      ...options,
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
      debug('[docker] [exec] %s', text.replace(/[\r\n]+$/, ''))
      capturedStdout += text
    })

    stderr.setEncoding('utf8').on('data', (text: string) => {
      // Trim trailing newlines
      debug('[docker] [exec] %s', text.replace(/[\r\n]+$/, ''))
      capturedStderr += text
    })

    return new Promise((resolve, reject) => {
      let finished = false
      stream.on('end', async () => {
        finished = true
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
        finished = true
        stdout.end()
        stderr.end()
        reject(error)
      })

      stream.on('close', () => {
        if (!finished) {
          finished = true
          stdout.end()
          stderr.end()
          reject(new Error('Docker exec stream closed before ending'))
        }
      })

      this.#client.modem.demuxStream(stream, stdout, stderr)
    })
  }

  stop() {
    return this.unwrap().remove()
  }
}

type ExecCreateOptions = Omit<Docker.ExecCreateOptions, 'AttachStdout' | 'AttachStderr'>

type CommandResult = {
  stdout: string
  stderr: string
  exitCode: number
}

function isDockerNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'statusCode' in error && error.statusCode === 404
}

export {Container, RunningContainer}
export type {CreateContainerOptions}
