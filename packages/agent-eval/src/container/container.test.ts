import {PassThrough, Readable} from 'node:stream'
import {once} from 'node:events'
import Docker from 'dockerode'
import {afterEach, beforeAll, describe, expect, test, vi} from 'vitest'
import {Container, RunningContainer} from './container'
import {ContainerImage} from './image'
import {ImageReference} from './image-reference'
import {ImageTag} from './image-tag'

let image: ContainerImage

beforeAll(async () => {
  const docker = new Docker()
  vi.spyOn(docker, 'buildImage').mockResolvedValue(Readable.from(['{}\n']))
  image = await ContainerImage.build(docker, Readable.from([]), {
    t: ImageReference.create({
      path: 'container-contract-test',
      tag: ImageTag.create({
        dockerfile: 'FROM scratch',
      }),
    }),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function createContainer() {
  const docker = new Docker()
  const raw = docker.getContainer('container-contract-test')
  vi.spyOn(docker, 'createContainer').mockResolvedValue(raw)
  vi.spyOn(raw, 'start').mockResolvedValue(undefined)
  vi.spyOn(raw, 'remove').mockResolvedValue(undefined)
  const container = await Container.create({
    client: docker,
    image,
  })
  return {
    docker,
    container,
    raw,
  }
}

async function createCommand() {
  const fixture = await createContainer()
  const running = await RunningContainer.start(fixture.docker, fixture.container)
  const exec = fixture.docker.getExec('command-contract-test')
  const stream = new PassThrough()
  const ready = Promise.withResolvers<void>()
  stream.on('newListener', event => {
    if (event === 'error') {
      ready.resolve()
    }
  })
  vi.spyOn(fixture.raw, 'exec').mockResolvedValue(exec)
  vi.spyOn(exec, 'start').mockResolvedValue(stream)
  // Supply only the daemon response consumed by exec, not a fabricated inspect object.
  vi.spyOn(fixture.docker.modem, 'dial').mockImplementation((_options, complete) => {
    complete?.(null, {
      ExitCode: 0,
    })
  })
  return {
    ...fixture,
    running,
    exec,
    stream,
    ready: ready.promise,
  }
}

describe('Container', () => {
  test('propagates the exact creation error', async () => {
    const docker = new Docker()
    const error = new Error('creation refused')
    vi.spyOn(docker, 'createContainer').mockRejectedValue(error)

    await expect(
      Container.create({
        client: docker,
        image,
      }),
    ).rejects.toBe(error)
  })
})

describe('RunningContainer', () => {
  test('waits for startup before returning ownership', async () => {
    const {docker, container, raw} = await createContainer()
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    vi.spyOn(raw, 'start').mockImplementation(async () => {
      entered.resolve()
      await release.promise
    })
    let settled = false
    const acquisition = RunningContainer.start(docker, container).finally(() => {
      settled = true
    })

    try {
      await entered.promise
      expect(settled).toBe(false)

      release.resolve()
      await using running = await acquisition
      expect(running.unwrap()).toBe(container)
    } finally {
      release.resolve()
      await Promise.allSettled([acquisition])
    }
  })

  describe('with startup failure', () => {
    test('waits for cleanup before rejecting with the original error', async () => {
      const {docker, container, raw} = await createContainer()
      const error = new Error('startup refused')
      const entered = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      vi.spyOn(raw, 'start').mockRejectedValue(error)
      vi.spyOn(raw, 'remove').mockImplementation(async () => {
        entered.resolve()
        await release.promise
      })
      let settled = false
      const acquisition = RunningContainer.start(docker, container).finally(() => {
        settled = true
      })
      const rejected = expect(acquisition).rejects.toBe(error)

      try {
        await entered.promise
        expect(settled).toBe(false)

        release.resolve()
        await rejected
        expect(raw.remove).toHaveBeenCalledWith({
          force: true,
        })
      } finally {
        release.resolve()
        await Promise.allSettled([acquisition, rejected])
      }
    })

    describe('with cleanup failure', () => {
      test('preserves both error references in order and the cleanup cause', async () => {
        const {docker, container, raw} = await createContainer()
        const startupError = new Error('startup refused')
        const cleanupError = new Error('removal refused')
        vi.spyOn(raw, 'start').mockRejectedValue(startupError)
        vi.spyOn(raw, 'remove').mockRejectedValue(cleanupError)

        const result = await RunningContainer.start(docker, container).catch((error: unknown) => {
          return error
        })

        expect(result).toBeInstanceOf(AggregateError)
        if (!(result instanceof AggregateError)) {
          throw new Error('Expected acquisition to reject with an AggregateError')
        }
        expect(result.errors).toHaveLength(2)
        expect(result.errors[0]).toBe(startupError)
        expect(result.errors[1]).toBe(cleanupError)
        expect(result.cause).toBe(cleanupError)
      })
    })
  })

  describe('with removal failure', () => {
    test('tolerates not-found during disposal', async () => {
      const {docker, container, raw} = await createContainer()
      const running = await RunningContainer.start(docker, container)
      vi.spyOn(raw, 'remove').mockRejectedValue(
        Object.assign(new Error('already removed'), {
          statusCode: 404,
        }),
      )

      await expect(running[Symbol.asyncDispose]()).resolves.toBeUndefined()
    })

    test('propagates the exact non-not-found disposal error', async () => {
      const {docker, container, raw} = await createContainer()
      const running = await RunningContainer.start(docker, container)
      const error = Object.assign(new Error('removal refused'), {
        statusCode: 500,
      })
      vi.spyOn(raw, 'remove').mockRejectedValue(error)

      await expect(running[Symbol.asyncDispose]()).rejects.toBe(error)
    })

    test('propagates the exact not-found error from explicit stop', async () => {
      const {docker, container, raw} = await createContainer()
      const running = await RunningContainer.start(docker, container)
      const error = Object.assign(new Error('already removed'), {
        statusCode: 404,
      })
      vi.spyOn(raw, 'remove').mockRejectedValue(error)

      await expect(running.stop()).rejects.toBe(error)
    })
  })

  describe('with command failure', () => {
    test('propagates the exact exec creation error', async () => {
      const {docker, container, raw} = await createContainer()
      await using running = await RunningContainer.start(docker, container)
      const error = new Error('exec creation refused')
      vi.spyOn(raw, 'exec').mockRejectedValue(error)

      await expect(
        running.exec({
          Cmd: ['true'],
        }),
      ).rejects.toBe(error)
    })

    test('propagates the exact exec startup error', async () => {
      const {running, exec, stream} = await createCommand()
      const error = new Error('exec startup refused')
      vi.spyOn(exec, 'start').mockRejectedValue(error)

      try {
        await expect(
          running.exec({
            Cmd: ['true'],
          }),
        ).rejects.toBe(error)
      } finally {
        stream.destroy()
        await running[Symbol.asyncDispose]()
      }
    })

    test('propagates the exact inspection error', async () => {
      const {running, exec, stream, ready} = await createCommand()
      const error = new Error('inspection refused')
      vi.spyOn(exec, 'inspect').mockRejectedValue(error)
      const command = running.exec({
        Cmd: ['true'],
      })
      const rejected = expect(command).rejects.toBe(error)

      try {
        await ready
        stream.end()
        await rejected
      } finally {
        stream.destroy()
        await running[Symbol.asyncDispose]()
      }
    })

    test('preserves the exact stream error through close', async () => {
      const {running, stream, ready} = await createCommand()
      const error = new Error('transport failed')
      const command = running.exec({
        Cmd: ['true'],
      })
      const rejected = expect(command).rejects.toBe(error)

      try {
        await ready
        stream.destroy(error)
        await rejected
      } finally {
        stream.destroy()
        await running[Symbol.asyncDispose]()
      }
    })
  })

  describe('with a command stream', () => {
    test('rejects premature close without an error', async () => {
      const {running, stream, ready} = await createCommand()
      const command = running.exec({
        Cmd: ['true'],
      })
      const rejected = expect(command).rejects.toThrow('Docker exec stream closed before ending')

      try {
        await ready
        stream.destroy()
        await rejected
      } finally {
        stream.destroy()
        await running[Symbol.asyncDispose]()
      }
    })

    test('waits for end and inspection even when normal close follows end', async () => {
      const {docker, running, stream, ready} = await createCommand()
      const inspected = Promise.withResolvers<NonNullable<Parameters<typeof docker.modem.dial>[1]>>()
      const dial = vi.spyOn(docker.modem, 'dial').mockImplementation((_options, complete) => {
        if (complete) {
          inspected.resolve(complete)
        }
      })
      let settled = false
      const command = running
        .exec({
          Cmd: ['true'],
        })
        .finally(() => {
          settled = true
        })
      void command.catch(() => {
        return undefined
      })
      let complete: NonNullable<Parameters<typeof docker.modem.dial>[1]> | undefined

      try {
        await ready
        expect(settled).toBe(false)
        expect(dial).not.toHaveBeenCalled()

        const closed = once(stream, 'close')
        stream.end()
        complete = await inspected.promise
        await closed
        expect(settled).toBe(false)

        complete(null, {
          ExitCode: 0,
        })
        expect(await command).toEqual({
          stdout: '',
          stderr: '',
          exitCode: 0,
        })
      } finally {
        complete?.(null, {
          ExitCode: 0,
        })
        stream.destroy()
        await running[Symbol.asyncDispose]()
        await Promise.allSettled([command])
      }
    })
  })
})
