import {afterEach, expect, test, vi} from 'vitest'
import Docker from 'dockerode'
import tarFs from 'tar-fs'
import tarStream from 'tar-stream'
import {VirtualHost} from '../host'
import {buildLocalDockerImage, buildScenarioDockerImage} from './build'

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

test('generates an image with fixture files and dependencies but without per-trial setup', async () => {
  const pack = vi.spyOn(tarFs, 'pack').mockImplementation((_directory, options) => {
    if (!options?.pack) {
      throw new Error('Expected a context containing the generated Dockerfile')
    }
    options.pack.finalize()
    return options.pack
  })
  let dockerfile = ''
  const docker = {
    buildImage: vi.fn(async (archive: tarStream.Pack) => {
      const extract = tarStream.extract()
      const finished = new Promise<void>((resolve, reject) => {
        extract.on('entry', (header, stream, next) => {
          expect(header.name).toBe('Dockerfile')
          stream.on('data', chunk => {
            dockerfile += chunk.toString()
          })
          stream.on('end', next)
          stream.on('error', reject)
        })
        extract.on('finish', resolve)
        extract.on('error', reject)
      })
      archive.pipe(extract)
      await finished
      return {}
    }),
    modem: {
      followProgress: vi.fn((_stream: unknown, done: (error: Error | null) => void) => {
        done(null)
      }),
    },
  }

  // @ts-expect-error Only the Docker build API is needed.
  const image = await buildScenarioDockerImage(docker, 'runtime:ready', {
    directory: '/scenario',
    exclude: ['checks', 'node_modules'],
  })

  expect(docker.buildImage).toHaveBeenCalledWith(expect.anything(), {
    dockerfile: 'Dockerfile',
    buildargs: {BASE_IMAGE: 'runtime:ready'},
    t: image,
  })
  expect(dockerfile).toContain('COPY --chown=1000:1000 scenario/ ./')
  expect(dockerfile).toContain('npm pkg set name=agent-eval-scenario')
  expect(dockerfile).toContain('npm pkg delete devDependencies.@primer/agent-eval')
  expect(dockerfile).toContain('npm install')
  expect(dockerfile).not.toContain('npm run build')
  const ignore = pack.mock.calls[0][1]?.ignore
  expect(ignore?.('/scenario/src/index.js')).toBe(false)
  expect(ignore?.('/scenario/checks/private.txt')).toBe(true)
  expect(ignore?.('/scenario/node_modules')).toBe(true)
})
