import path from 'node:path'
import {Readable} from 'node:stream'
import {pipeline} from 'node:stream/promises'
import {afterEach, expect, test, vi} from 'vitest'
import {buildImage} from '../docker'
import {VirtualHost} from '../host'
import {DEFAULT_DOCKER_IMAGE} from '../sandbox/constants'
import {buildScenarioImage, type Scenario} from './scenario'

vi.mock('../docker', async importOriginal => {
  const original = await importOriginal<typeof import('../docker')>()
  return {
    ...original,
    buildImage: vi.fn<typeof original.buildImage>(async (_context, options) => {
      await Readable.from(_context).toArray()
      return {tagName: options.t}
    }),
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

test('scenario image archives use host files and exclude ignored paths', async () => {
  const host = VirtualHost.create({
    '/scenarios/example': {
      'package.json': '{"name":"example"}',
      'scenario.config.ts': 'Scenario configuration',
      '.dockerignore': 'Original ignore rules',
      Dockerfile: 'Original Dockerfile',
      src: {'index.ts': 'export const value = 1'},
      node_modules: {'dependency.js': 'Dependency'},
    },
  })
  vi.mocked(buildImage).mockImplementationOnce(async (context, options) => {
    await pipeline(context, host.archive.extract('/image-context'))
    return {tagName: options.t}
  })

  await buildScenarioImage({
    host,
    scenario: {
      id: 'example',
      directory: '/scenarios/example',
      prompt: 'Update the example',
      tags: [],
      checks: [],
      judges: [],
      image: {type: 'Default'},
    },
  })

  await expect(host.fs.promises.readFile('/image-context/Dockerfile', 'utf8')).resolves.toContain(
    `FROM ${DEFAULT_DOCKER_IMAGE}\n`,
  )
  await expect(host.fs.promises.readFile('/image-context/.dockerignore', 'utf8')).resolves.toBe(
    'Dockerfile\n.dockerignore\n',
  )
  await expect(host.fs.promises.readFile('/image-context/package.json', 'utf8')).resolves.toBe('{"name":"example"}')
  await expect(host.fs.promises.readFile('/image-context/src/index.ts', 'utf8')).resolves.toBe('export const value = 1')
  expect((await host.fs.promises.readdir('/image-context')).sort()).toEqual([
    '.dockerignore',
    'Dockerfile',
    'package.json',
    'src',
  ])
})

test.each(['Default', 'Reference', 'Build'] as const)(
  '%s images use distinct tags for identical scenarios in different build contexts',
  async type => {
    const host = VirtualHost.create({
      '/first/example/Dockerfile': 'FROM node:26-slim\nCOPY . .\n',
      '/second/example/Dockerfile': 'FROM node:26-slim\nCOPY . .\n',
    })
    const createScenario = (directory: string): Scenario => {
      return {
        id: 'example',
        directory,
        prompt: 'Update the example',
        tags: [],
        checks: [],
        judges: [],
        image:
          type === 'Build'
            ? {type, dockerfile: path.join(directory, 'Dockerfile'), context: directory}
            : type === 'Reference'
              ? {type, name: 'node:26-slim'}
              : {type},
      }
    }

    const [first, second] = await Promise.all([
      buildScenarioImage({host, scenario: createScenario('/first/example')}),
      buildScenarioImage({host, scenario: createScenario('/second/example')}),
    ])
    const repeated = await buildScenarioImage({host, scenario: createScenario('/first/example')})

    expect(first.tagName).toMatch(/^agent-eval\/scenarios\/example:[a-f0-9]{16}$/)
    expect(first.tagName).not.toBe(second.tagName)
    expect(repeated.tagName).toBe(first.tagName)
    expect(buildImage).toHaveBeenCalledTimes(3)

    if (type === 'Build') {
      const scenario = createScenario('/first/example')
      scenario.image = {
        type,
        dockerfile: '/first/example/Dockerfile',
        context: '/second/example',
      }
      const differentContext = await buildScenarioImage({host, scenario})
      expect(differentContext.tagName).toBe(second.tagName)
    }
  },
)
