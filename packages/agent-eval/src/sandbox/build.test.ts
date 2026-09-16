import {afterEach, expect, test, vi} from 'vitest'
import Docker from 'dockerode'
import tarFs from 'tar-fs'
import tarStream from 'tar-stream'
import {VirtualHost} from '../host'
import {buildLocalDockerImage} from './build'

afterEach(() => {
  vi.restoreAllMocks()
})

function createHost() {
  return VirtualHost.create({
    '/project/docker/Dockerfile': 'FROM node:26-slim\nCOPY src /home/sandbox/workspace/src',
    '/project/src/index.js': 'export const value = 1',
    '/project/.dockerignore': 'node_modules',
  })
}

test('builds a local Dockerfile with a filtered context', async () => {
  const host = createHost()
  await host.fs.writeFile('/project/.dockerignore', 'node_modules\nsrc/private.txt\n**/*.secret\nDockerfile')
  const archive = tarStream.pack()
  const pack = vi.spyOn(tarFs, 'pack').mockReturnValue(archive)
  const docker = {
    buildImage: vi.fn().mockResolvedValue({}),
    modem: {
      followProgress: vi.fn((_stream: unknown, onFinished: (error: Error | null) => void) => {
        onFinished(null)
      }),
    },
  }

  // @ts-expect-error Only the Docker image build API is needed.
  const image = await buildLocalDockerImage(docker, host, {
    dockerfile: '/project/docker/Dockerfile',
    context: '/project',
  })

  expect(docker.buildImage).toHaveBeenCalledWith(archive, {dockerfile: 'docker/Dockerfile', t: image})
  expect(pack).toHaveBeenCalledWith('/project', expect.anything())
  const ignore = pack.mock.calls[0][1]?.ignore
  expect(ignore?.('/project')).toBe(false)
  expect(ignore?.('/project/docker')).toBe(false)
  expect(ignore?.('/project/docker/Dockerfile')).toBe(false)
  expect(ignore?.('/project/.dockerignore')).toBe(false)
  expect(ignore?.('/project/node_modules')).toBe(true)
  expect(ignore?.('/project/src/private.txt')).toBe(true)
  expect(ignore?.('/project/src/file.secret')).toBe(true)
  expect(ignore?.('/project/src/index.js')).toBe(false)
  expect(image).toMatch(/^agent-eval-workspace:/)
  archive.finalize()
})

test('propagates Dockerfile build failures', async () => {
  vi.spyOn(tarFs, 'pack').mockReturnValue(tarStream.pack())
  const error = new Error('Dockerfile build failed')
  const docker = {
    buildImage: vi.fn().mockResolvedValue({}),
    modem: {
      followProgress: vi.fn((_stream: unknown, onFinished: (error: Error | null) => void) => {
        onFinished(error)
      }),
    },
  }

  await expect(
    // @ts-expect-error Only the Docker image build API is needed.
    buildLocalDockerImage(docker, createHost(), {
      dockerfile: '/project/docker/Dockerfile',
      context: '/project',
    }),
  ).rejects.toBe(error)
})

test('rejects build errors delivered as JSON messages on a successful stream', async () => {
  vi.spyOn(tarFs, 'pack').mockReturnValue(tarStream.pack())
  const docker = {
    buildImage: vi.fn().mockResolvedValue({}),
    modem: {
      followProgress: vi.fn((_stream: unknown, onFinished: (error: Error | null, output: Array<unknown>) => void) => {
        onFinished(null, [{stream: 'Step 1'}, {error: 'COPY failed: missing source'}])
      }),
    },
  }

  await expect(
    // @ts-expect-error Only the Docker image build API is needed.
    buildLocalDockerImage(docker, createHost(), {
      dockerfile: '/project/docker/Dockerfile',
      context: '/project',
    }),
  ).rejects.toThrow('COPY failed: missing source')
})

test('rejects a Dockerfile outside its context before building', async () => {
  const docker = new Docker()
  const build = vi.spyOn(docker, 'buildImage')

  await expect(
    buildLocalDockerImage(docker, createHost(), {
      dockerfile: '/project/docker/Dockerfile',
      context: '/project/src',
    }),
  ).rejects.toThrow('Dockerfile must be inside the build context')
  expect(build).not.toHaveBeenCalled()
})
