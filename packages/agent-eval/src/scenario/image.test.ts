import path from 'node:path'
import tarFs from 'tar-fs'
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

test.each([
  {name: 'package default', dockerImage: undefined, expected: DEFAULT_DOCKER_IMAGE},
  {name: 'override', dockerImage: 'node:26-slim', expected: 'node:26-slim'},
])('the default scenario Dockerfile uses the $name and retains system tooling', async ({dockerImage, expected}) => {
  const context = tarFs.pack('.', {entries: [], finalize: false})
  const entry = vi.spyOn(context, 'entry')
  vi.spyOn(tarFs, 'pack').mockImplementation((_directory, options) => {
    options?.finish?.(context)
    return context
  })

  await buildScenarioImage({
    dockerImage,
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
    expect.stringContaining(`FROM ${expected}\n`),
  )
  expect(entry).toHaveBeenCalledWith(
    expect.objectContaining({name: 'Dockerfile'}),
    expect.stringContaining('apt-get install -y --no-install-recommends ca-certificates chromium curl git'),
  )
})

test('default image overrides have distinct cache identities and only deduplicate matching pending builds', async () => {
  const createArchive = tarFs.pack
  vi.spyOn(tarFs, 'pack').mockImplementation(() => {
    return createArchive('.', {entries: []})
  })
  const host = VirtualHost.create()
  const scenario: Scenario = {
    id: 'example',
    directory: '/scenarios/example',
    prompt: 'Update the example',
    tags: [],
    checks: [],
    judges: [],
    image: {type: 'Default'},
  }

  const [defaultImage, explicitDefault, override, repeatedOverride] = await Promise.all([
    buildScenarioImage({host, scenario}),
    buildScenarioImage({host, scenario, dockerImage: DEFAULT_DOCKER_IMAGE}),
    buildScenarioImage({host, scenario, dockerImage: 'node:26-slim'}),
    buildScenarioImage({host, scenario, dockerImage: 'node:26-slim'}),
  ])
  const laterOverride = await buildScenarioImage({host, scenario, dockerImage: 'node:26-slim'})

  expect(defaultImage.tagName).toBe(explicitDefault.tagName)
  expect(override.tagName).not.toBe(defaultImage.tagName)
  expect(repeatedOverride.tagName).toBe(override.tagName)
  expect(laterOverride.tagName).toBe(override.tagName)
  expect(buildImage).toHaveBeenCalledTimes(3)
})

test.each(['Reference', 'Build'] as const)('%s images ignore the default base image override', async type => {
  const dockerfile = 'FROM node:26-slim\nCOPY . .\n'
  const host = VirtualHost.create({'/scenarios/example/Dockerfile': dockerfile})
  const context = tarFs.pack('.', {entries: [], finalize: false})
  const entry = vi.spyOn(context, 'entry')
  vi.spyOn(tarFs, 'pack').mockImplementation((_directory, options) => {
    options?.finish?.(context)
    return context
  })
  const scenario: Scenario = {
    id: 'example',
    directory: '/scenarios/example',
    prompt: 'Update the example',
    tags: [],
    checks: [],
    judges: [],
    image:
      type === 'Reference'
        ? {type, name: 'node:26-slim'}
        : {type, dockerfile: '/scenarios/example/Dockerfile', context: '/scenarios/example'},
  }

  const [normal, overridden] = await Promise.all([
    buildScenarioImage({host, scenario}),
    buildScenarioImage({host, scenario, dockerImage: 'node:24-slim'}),
  ])

  expect(overridden.tagName).toBe(normal.tagName)
  expect(buildImage).toHaveBeenCalledTimes(1)
  expect(entry).toHaveBeenCalledWith(
    expect.objectContaining({name: 'Dockerfile'}),
    type === 'Build' ? dockerfile : expect.stringContaining('FROM node:26-slim\n'),
  )
})

test.each(['Default', 'Reference', 'Build'] as const)(
  '%s images use distinct tags for identical scenarios in different build contexts',
  async type => {
    const host = VirtualHost.create({
      '/first/example/Dockerfile': 'FROM node:26-slim\nCOPY . .\n',
      '/second/example/Dockerfile': 'FROM node:26-slim\nCOPY . .\n',
    })
    const createArchive = tarFs.pack
    const pack = vi.spyOn(tarFs, 'pack').mockImplementation(() => {
      return createArchive('.', {entries: []})
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
