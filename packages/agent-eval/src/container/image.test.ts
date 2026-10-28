import {randomUUID} from 'node:crypto'
import {Readable} from 'node:stream'
import {buffer} from 'node:stream/consumers'
import Docker from 'dockerode'
import tarStream from 'tar-stream'
import {afterEach, expect, test, vi} from 'vitest'
import {ContainerImage} from './image'
import {ImageReference} from './image-reference'
import {ImageTag} from './image-tag'

afterEach(() => {
  vi.restoreAllMocks()
})

function createReference(dockerfile: string) {
  return ImageReference.create({
    path: 'agent-eval-test',
    tag: ImageTag.create({
      dockerfile,
    }),
  })
}

test('build forwards context and options and waits for progress completion before returning the image', async () => {
  const docker = new Docker()
  const context = Readable.from(['external build context'])
  const stream = Readable.from([])
  const t = createReference('FROM scratch')
  const options = {
    t,
    dockerfile: 'custom.Dockerfile',
    buildargs: {
      TITLE: 'example',
    },
    nocache: true,
  }
  const buildImage = vi.spyOn(docker, 'buildImage').mockResolvedValue(stream)
  const started = Promise.withResolvers<Parameters<Docker['modem']['followProgress']>[1]>()
  const followProgress = vi.spyOn(docker.modem, 'followProgress').mockImplementation((_stream, complete) => {
    started.resolve(complete)
  })
  let settled = false
  const build = ContainerImage.build(docker, context, options)
  const observed = build.then(
    image => {
      settled = true
      return image
    },
    error => {
      settled = true
      throw error
    },
  )
  void observed.catch(() => {
    return undefined
  })
  const complete = await started.promise

  try {
    expect(buildImage).toHaveBeenCalledWith(context, {
      ...options,
      t: t.unwrap(),
    })
    expect(followProgress.mock.calls[0]?.[0]).toBe(stream)
    await Promise.resolve()
    expect(settled).toBe(false)

    complete(null, [])
    expect((await observed).unwrap()).toBe(t.unwrap())
  } finally {
    complete(null, [])
    await Promise.allSettled([observed])
  }
})

test('build propagates the exact initial Docker build error', async () => {
  const docker = new Docker()
  const error = new Error('Docker rejected the build request')
  vi.spyOn(docker, 'buildImage').mockRejectedValue(error)
  const followProgress = vi.spyOn(docker.modem, 'followProgress').mockImplementation(() => {
    return undefined
  })

  await expect(
    ContainerImage.build(docker, Readable.from([]), {
      t: createReference('FROM scratch'),
    }),
  ).rejects.toBe(error)
  expect(followProgress).not.toHaveBeenCalled()
})

test('build propagates the exact progress callback error', async () => {
  const docker = new Docker()
  const error = new Error('Docker failed while building the image')
  vi.spyOn(docker, 'buildImage').mockResolvedValue(Readable.from([]))
  vi.spyOn(docker.modem, 'followProgress').mockImplementation((_stream, complete) => {
    complete(error, [])
  })

  await expect(
    ContainerImage.build(docker, Readable.from([]), {
      t: createReference('FROM scratch'),
    }),
  ).rejects.toBe(error)
})

test('buildFromDockerfile sends exact UTF-8 Dockerfile bytes in a tar with explicit filename and build options', async () => {
  const docker = new Docker()
  const dockerfile = 'FROM scratch\nLABEL org.opencontainers.image.title="café 日本語"\n'
  const t = createReference(dockerfile)
  const options = {
    t,
    dockerfile: 'ignored.Dockerfile',
    buildargs: {
      TITLE: 'example',
    },
    nocache: true,
  }
  const entries: Array<{
    name: string
    size: number
    contents: Buffer
  }> = []
  const buildImage = vi.spyOn(docker, 'buildImage').mockImplementation(async context => {
    if (typeof context === 'string' || !('pipe' in context)) {
      throw new Error('Expected a streamed tar build context')
    }
    const extract = tarStream.extract()
    extract.end(await buffer(context))
    for await (const entry of extract) {
      entries.push({
        name: entry.header.name,
        size: entry.header.size,
        contents: await buffer(Readable.from(entry)),
      })
    }
    return Readable.from([])
  })
  vi.spyOn(docker.modem, 'followProgress').mockImplementation((_stream, complete) => {
    complete(null, [])
  })

  const image = await ContainerImage.buildFromDockerfile(docker, dockerfile, options)

  expect(entries).toEqual([
    {
      name: 'Dockerfile',
      size: Buffer.byteLength(dockerfile),
      contents: Buffer.from(dockerfile),
    },
  ])
  expect(buildImage.mock.calls[0]?.[1]).toEqual({
    ...options,
    t: t.unwrap(),
    dockerfile: 'Dockerfile',
  })
  expect(image.unwrap()).toBe(t.unwrap())
})

test(
  'buildFromDockerfile builds a real Docker image',
  {
    tags: ['docker'],
    timeout: 30_000,
  },
  async () => {
    const docker = new Docker({
      timeout: 10_000,
    })
    const dockerfile = 'FROM scratch\nLABEL org.opencontainers.image.title="agent-eval-test"'
    const t = ImageReference.create({
      path: `agent-eval-test-${randomUUID()}`,
      tag: ImageTag.create({
        dockerfile,
      }),
    })

    try {
      const image = await ContainerImage.buildFromDockerfile(docker, dockerfile, {
        t,
      })
      expect(image.unwrap()).toBe(t.unwrap())
      const info = await docker.getImage(t.unwrap()).inspect()
      expect(info.Config.Labels['org.opencontainers.image.title']).toBe('agent-eval-test')
    } finally {
      await docker
        .getImage(t.unwrap())
        .remove({
          force: true,
        })
        .catch(error => {
          if (!(error instanceof Error && 'statusCode' in error && error.statusCode === 404)) {
            throw error
          }
        })
    }
  },
)
