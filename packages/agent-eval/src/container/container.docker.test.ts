import {randomUUID} from 'node:crypto'
import {addAbortSignal, Readable} from 'node:stream'
import Docker from 'dockerode'
import {afterAll, afterEach, beforeAll, describe, expect, test, vi} from 'vitest'
import {Container, RunningContainer, type CreateContainerOptions} from './container'
import {ContainerImage} from './image'
import {ImageReference} from './image-reference'
import {ImageTag} from './image-tag'
import {DEFAULT_DOCKER_IMAGE} from '../sandbox/constants'

const docker = new Docker({
  timeout: 5_000,
})
const dockerfile = `FROM ${DEFAULT_DOCKER_IMAGE}`
const reference = ImageReference.create({
  path: `agent-eval-container-test-${randomUUID()}`,
  tag: ImageTag.create({
    dockerfile,
  }),
})
const owned = new Set<Docker.Container>()
let building: Promise<ContainerImage> | undefined
let imageOwned = false
let image: ContainerImage

async function ignoreNotFound(operation: Promise<unknown>) {
  try {
    await operation
  } catch (error) {
    if (!(error instanceof Error && 'statusCode' in error && error.statusCode === 404)) {
      throw error
    }
  }
}

async function buildImage() {
  await docker.getImage(DEFAULT_DOCKER_IMAGE).inspect()
  imageOwned = true
  const deadline = AbortSignal.timeout(15_000)
  const followProgress = docker.modem.followProgress.bind(docker.modem)
  const progress = vi.spyOn(docker.modem, 'followProgress').mockImplementation((stream, complete, onProgress) => {
    if (!(stream instanceof Readable)) {
      throw new Error('Expected a cancellable Docker build response stream')
    }
    // HTTP request timeouts alone do not bound the progress stream's lifetime.
    followProgress(stream, complete, onProgress)
    addAbortSignal(deadline, stream)
  })

  try {
    return await ContainerImage.buildFromDockerfile(docker, dockerfile, {
      t: reference,
      pull: false,
      abortSignal: deadline,
    })
  } finally {
    progress.mockRestore()
  }
}

async function prepareImage() {
  building ??= buildImage()
  image = await building
}

async function cleanContainers() {
  const results = await Promise.allSettled(
    Array.from(owned, async raw => {
      await ignoreNotFound(
        raw.remove({
          force: true,
        }),
      )
      await expect(raw.inspect()).rejects.toMatchObject({
        statusCode: 404,
      })
      owned.delete(raw)
    }),
  )
  const errors: Array<unknown> = []
  for (const result of results) {
    if (result.status === 'rejected') {
      errors.push(result.reason)
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Failed to clean up test containers')
  }
}

afterEach(cleanContainers, 30_000)

afterAll(async () => {
  if (building) {
    // Drain initialization even if the owning beforeAll hook failed or timed out.
    await Promise.allSettled([building])
  }
  const errors: Array<unknown> = []
  try {
    await cleanContainers()
  } catch (error) {
    errors.push(error)
  }
  if (imageOwned) {
    const raw = docker.getImage(reference.unwrap())
    try {
      await ignoreNotFound(
        raw.remove({
          force: true,
        }),
      )
      await expect(raw.inspect()).rejects.toMatchObject({
        statusCode: 404,
      })
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Failed to clean up Docker test resources')
  }
}, 60_000)

async function createContainer(options: Omit<CreateContainerOptions, 'client' | 'image' | 'name'> = {}) {
  const name = `agent-eval-container-test-${randomUUID()}`
  owned.add(docker.getContainer(name))
  return await Container.create({
    client: docker,
    image,
    name,
    ...options,
  })
}

describe(
  'Container',
  {
    tags: ['docker'],
    timeout: 30_000,
  },
  () => {
    beforeAll(prepareImage, 30_000)

    test('defaults to an auto-removed interactive sleep command', async () => {
      const container = await createContainer()

      const info = await container.unwrap().inspect()

      expect(info.Config.Image).toBe(image.unwrap())
      expect(info.Config.Cmd).toEqual(['sleep', 'infinity'])
      expect(info.Config.Tty).toBe(true)
      expect(info.HostConfig.AutoRemove).toBe(true)
    })

    test('preserves command, terminal and host configuration overrides', async () => {
      const container = await createContainer({
        Cmd: ['sh', '-c', 'printf ready'],
        Tty: false,
        Env: ['TITLE=example'],
        WorkingDir: '/home/node',
        HostConfig: {
          AutoRemove: false,
          NetworkMode: 'none',
          Memory: 64 * 1024 * 1024,
        },
      })

      const info = await container.unwrap().inspect()

      expect(info.Config.Cmd).toEqual(['sh', '-c', 'printf ready'])
      expect(info.Config.Tty).toBe(false)
      expect(info.Config.Env).toContain('TITLE=example')
      expect(info.Config.WorkingDir).toBe('/home/node')
      expect(info.HostConfig).toMatchObject({
        AutoRemove: false,
        NetworkMode: 'none',
        Memory: 64 * 1024 * 1024,
      })
    })

    describe('with a conflicting name', () => {
      test('rejects creation without replacing the existing container', async () => {
        const container = await createContainer()
        const before = await container.unwrap().inspect()

        await expect(
          Container.create({
            client: docker,
            image,
            name: before.Name.slice(1),
          }),
        ).rejects.toMatchObject({
          statusCode: 409,
        })

        const after = await container.unwrap().inspect()
        expect(after.Id).toBe(before.Id)
        expect(after.State.Status).toBe('created')
      })
    })
  },
)

describe(
  'RunningContainer',
  {
    tags: ['docker'],
    timeout: 30_000,
  },
  () => {
    beforeAll(prepareImage, 30_000)

    test.each([
      {
        context: 'successful scope',
        bodyError: undefined,
      },
      {
        context: 'throwing scope',
        bodyError: new Error('scope failed'),
      },
    ])('releases ownership after a $context', async ({bodyError}) => {
      const container = await createContainer()
      const scope = async () => {
        await using running = await RunningContainer.start(docker, container)
        expect(running.unwrap()).toBe(container)
        expect((await container.unwrap().inspect()).State.Running).toBe(true)
        if (bodyError) {
          throw bodyError
        }
      }

      if (bodyError) {
        await expect(scope()).rejects.toBe(bodyError)
      } else {
        await scope()
      }

      await expect(container.unwrap().inspect()).rejects.toMatchObject({
        statusCode: 404,
      })
    })

    test('captures UTF-8 output, trailing newlines and nonzero status', async () => {
      const container = await createContainer()
      await using running = await RunningContainer.start(docker, container)

      const result = await running.exec({
        Cmd: [
          'sh',
          '-c',
          "printf 'café\\n'; printf '日本語\\r\\n' >&2; printf 'last stdout\\n\\n'; printf 'last stderr\\n' >&2; exit 7",
        ],
        Tty: false,
      })

      expect(result).toEqual({
        stdout: 'café\nlast stdout\n\n',
        stderr: '日本語\r\nlast stderr\n',
        exitCode: 7,
      })
    })

    test('applies command environment, working directory and user options', async () => {
      const container = await createContainer()
      await using running = await RunningContainer.start(docker, container)

      const result = await running.exec({
        Cmd: ['sh', '-c', 'printf "%s\\n" "$TITLE"; pwd; id -u; id -g'],
        Env: ['TITLE=example'],
        WorkingDir: '/home/node',
        User: '1000:1000',
        Tty: false,
      })

      expect(result).toEqual({
        stdout: 'example\n/home/node\n1000\n1000\n',
        stderr: '',
        exitCode: 0,
      })
    })

    describe('with startup failure', () => {
      test('removes the container before propagating the daemon error', async () => {
        const container = await createContainer({
          Cmd: ['/agent-eval-missing-command'],
          Entrypoint: [],
          HostConfig: {
            AutoRemove: false,
          },
        })

        await expect(RunningContainer.start(docker, container)).rejects.toMatchObject({
          statusCode: expect.any(Number),
        })

        await expect(container.unwrap().inspect()).rejects.toMatchObject({
          statusCode: 404,
        })
      })
    })
  },
)
