import {describe, expect, test} from 'vitest'
import {VirtualHost} from '../host'
import {logger} from '../logger'
import {VirtualSandbox} from '../sandbox'
import {defineConfig, parseScenarioConfig} from './config'

describe('defineConfig', () => {
  test('leaves omitted setup undefined', () => {
    const config = defineConfig({prompt: 'Create a page'})

    expect(config.setup).toBeUndefined()
  })

  test('defaults omitted collections to empty arrays', () => {
    const config = defineConfig({prompt: 'Create a page'})

    expect(config).toMatchObject({
      prompt: 'Create a page',
      tags: [],
      checks: [],
      judges: [],
    })
  })

  test('preserves supplied metadata and collections instead of replacing them with defaults', () => {
    const config = defineConfig({
      prompt: 'Create a page',
      description: 'Example',
      tags: ['forms', 'accessibility'],
      checks: [
        {
          name: 'build',
          async run() {
            return {outcomes: []}
          },
        },
      ],
      judges: [{name: 'visual', scores: [{value: 1, description: 'Matches'}]}],
    })

    expect(config).toMatchObject({
      prompt: 'Create a page',
      description: 'Example',
      tags: ['forms', 'accessibility'],
      checks: [{name: 'build'}],
      judges: [{name: 'visual'}],
    })
  })
})

describe('parseScenarioConfig', () => {
  test('leaves omitted setup undefined', () => {
    const host = VirtualHost.create()

    const config = parseScenarioConfig(host, '/scenarios/example', {prompt: 'Create a page'})

    expect(config.setup).toBeUndefined()
  })

  test('preserves callable setup across defineConfig and parsing without executing it', async () => {
    const host = VirtualHost.create()
    await using sandbox = await VirtualSandbox.create({host})
    await sandbox.writeFile('setup.txt', 'Not run')
    const input = defineConfig({
      prompt: 'Create a page',
      async setup({sandbox}) {
        await sandbox.writeFile('setup.txt', 'Custom setup')
      },
    })

    const config = parseScenarioConfig(host, '/scenarios/example', input)

    expect(await sandbox.readFile('setup.txt')).toBe('Not run')
    expect(config.setup).toBeTypeOf('function')
    await config.setup!({sandbox})
    expect(await sandbox.readFile('setup.txt')).toBe('Custom setup')
  })

  test('applies collection defaults when reading a raw config', () => {
    const host = VirtualHost.create()

    const config = parseScenarioConfig(host, '/scenarios/example', {prompt: 'Create a page'})

    expect(config).toMatchObject({tags: [], checks: [], judges: []})
  })

  test.each([
    {
      name: 'string image reference',
      image: 'node:26-slim',
      expected: {type: 'Reference', name: 'node:26-slim'},
    },
    {
      name: 'object image reference',
      image: {name: 'node:26-slim'},
      expected: {type: 'Reference', name: 'node:26-slim'},
    },
    {
      name: 'relative Dockerfile with default context',
      image: {dockerfile: 'Dockerfile'},
      expected: {type: 'Build', dockerfile: '/scenarios/example/Dockerfile', context: '/scenarios/example'},
    },
    {
      name: 'relative Dockerfile with explicit context',
      image: {dockerfile: 'Dockerfile', context: 'workspace'},
      expected: {type: 'Build', dockerfile: '/scenarios/example/Dockerfile', context: '/scenarios/example/workspace'},
    },
    {
      name: 'absolute Dockerfile and context',
      image: {dockerfile: '/scenarios/example/Dockerfile', context: '/scenarios/example/workspace'},
      expected: {type: 'Build', dockerfile: '/scenarios/example/Dockerfile', context: '/scenarios/example/workspace'},
    },
  ])('resolves a $name after defineConfig', ({image, expected}) => {
    const host = VirtualHost.create({
      '/scenarios/example/Dockerfile': 'FROM node:26-slim',
      '/scenarios/example/workspace': {},
    })
    const input = defineConfig({prompt: 'Create a page', image})

    const config = parseScenarioConfig(host, '/scenarios/example', input)

    expect(config.image).toEqual(expected)
  })

  test('preserves callable checks and their results across defineConfig and parsing', async () => {
    const host = VirtualHost.create()
    const input = defineConfig({
      prompt: 'Create a page',
      checks: [
        {
          name: 'single',
          async run() {
            return {outcomes: [{type: 'outcome', status: 'passed'}]}
          },
        },
        {
          name: 'multiple',
          async run() {
            return [
              {id: 'tests', outcomes: [{type: 'outcome', status: 'passed'}]},
              {id: 'score', measurements: [{type: 'measurement', value: 42}], unit: 'points'},
            ]
          },
        },
      ],
    })
    await using sandbox = await VirtualSandbox.create({host})

    const config = parseScenarioConfig(host, '/scenarios/example', input)

    await expect(config.checks[0]!.run({logger, sandbox})).resolves.toEqual({
      outcomes: [{type: 'outcome', status: 'passed'}],
    })
    await expect(config.checks[1]!.run({logger, sandbox})).resolves.toEqual([
      {id: 'tests', outcomes: [{type: 'outcome', status: 'passed'}]},
      {id: 'score', measurements: [{type: 'measurement', value: 42}], unit: 'points'},
    ])
  })

  test.each([
    {name: 'a missing prompt', input: {}},
    {name: 'a non-string prompt', input: {prompt: 42}},
  ])('rejects $name', ({input}) => {
    const host = VirtualHost.create()

    expect(() => {
      parseScenarioConfig(host, '/scenarios/example', input)
    }).toThrow(/prompt/)
  })
})
