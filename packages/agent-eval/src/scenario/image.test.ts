import path from 'node:path'
import tarFs from 'tar-fs'
import tarStream from 'tar-stream'
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
      return {tagName: options.t}
    }),
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

test('the default scenario Dockerfile uses the shared sandbox image', async () => {
  const context = tarStream.pack()
  const entry = vi.spyOn(context, 'entry')
  vi.spyOn(tarFs, 'pack').mockImplementation((_directory, options) => {
    options?.finish?.(context)
    return context
  })

  await buildScenarioImage({
    host: VirtualHost.create(),
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

  expect(entry).toHaveBeenCalledWith(
    expect.objectContaining({name: 'Dockerfile'}),
    expect.stringContaining(`FROM ${DEFAULT_DOCKER_IMAGE}\n`),
  )
})

test.each(['Default', 'Reference', 'Build'] as const)(
  '%s images use distinct tags for identical scenarios in different build contexts',
  async type => {
    const host = VirtualHost.create({
      '/first/example/Dockerfile': 'FROM node:26-slim\nCOPY . .\n',
      '/second/example/Dockerfile': 'FROM node:26-slim\nCOPY . .\n',
    })
    const pack = vi.spyOn(tarFs, 'pack').mockImplementation(() => {
      const context = tarStream.pack()
      context.finalize()
      return context
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
    expect(pack).toHaveBeenCalledWith('/first/example', expect.any(Object))
    expect(pack).toHaveBeenCalledWith('/second/example', expect.any(Object))
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
