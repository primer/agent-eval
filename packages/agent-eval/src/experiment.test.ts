import {expect, test} from 'vitest'
import {defineConfig, getExperiment, listExperiments} from './experiment'
import {VirtualHost} from './host'

const config = defineConfig({
  name: 'Test experiment',
  description: 'Tests an experiment',
  models: ['gpt-5.6-sol'],
  scenarios: [
    {
      prompt: 'Complete the task',
    },
  ],
  treatments: [
    {
      name: 'Test treatment',
    },
  ],
})

test('listExperiments loads named and default exports from supported files', async () => {
  const serializedConfig = JSON.stringify(config)
  const host = VirtualHost.create({
    '/experiments': {
      'named.ts': `export const experiment = ${serializedConfig}`,
      'default.js': `export default ${serializedConfig}`,
      'commonjs.cjs': `export default ${serializedConfig}`,
      'module.mjs': `export default ${serializedConfig}`,
    },
  })

  const experiments = await listExperiments(host, '/experiments')

  expect(experiments).toHaveLength(4)
  expect(experiments).toEqual(
    expect.arrayContaining([
      {
        ...config,
        id: 'named',
        filepath: '/experiments/named.ts',
      },
      {
        ...config,
        id: 'default',
        filepath: '/experiments/default.js',
      },
      {
        ...config,
        id: 'commonjs',
        filepath: '/experiments/commonjs.cjs',
      },
      {
        ...config,
        id: 'module',
        filepath: '/experiments/module.mjs',
      },
    ]),
  )
})

test('listExperiments prefers the named experiment export', async () => {
  const namedConfig = {
    ...config,
    name: 'Named experiment',
  }
  const defaultConfig = {
    ...config,
    name: 'Default experiment',
  }
  const host = VirtualHost.create({
    '/experiments': {
      'experiment.ts': [
        `export const experiment = ${JSON.stringify(namedConfig)}`,
        `export default ${JSON.stringify(defaultConfig)}`,
      ].join('\n'),
    },
  })

  await expect(listExperiments(host, '/experiments')).resolves.toEqual([
    {
      ...namedConfig,
      id: 'experiment',
      filepath: '/experiments/experiment.ts',
    },
  ])
})

test('listExperiments ignores unsupported, reserved, missing, and invalid configs', async () => {
  const serializedConfig = JSON.stringify(config)
  const host = VirtualHost.create({
    '/experiments': {
      'valid.ts': `export const experiment = ${serializedConfig}`,
      'types.d.ts': `export const experiment = ${serializedConfig}`,
      'index.ts': `export const experiment = ${serializedConfig}`,
      'unsupported.json': serializedConfig,
      'missing.ts': 'export const value = true',
      'invalid.ts': 'export const experiment = {}',
    },
  })

  await expect(listExperiments(host, '/experiments')).resolves.toEqual([
    {
      ...config,
      id: 'valid',
      filepath: '/experiments/valid.ts',
    },
  ])
})

test('listExperiments throws when the directory does not exist', async () => {
  const host = VirtualHost.create()

  await expect(listExperiments(host, '/experiments')).rejects.toThrowError(
    'Experiments directory does not exist: /experiments',
  )
})

test('listExperiments throws when the path is not a directory', async () => {
  const host = VirtualHost.create({
    '/experiments': '',
  })

  await expect(listExperiments(host, '/experiments')).rejects.toThrowError(
    'Experiments path is not a directory: /experiments',
  )
})

test('getExperiment returns the experiment matching the id', async () => {
  const serializedConfig = JSON.stringify(config)
  const host = VirtualHost.create({
    '/experiments': {
      'first.ts': `export const experiment = ${serializedConfig}`,
      'second.ts': `export const experiment = ${serializedConfig}`,
    },
  })

  await expect(getExperiment(host, '/experiments', 'second')).resolves.toEqual({
    ...config,
    id: 'second',
    filepath: '/experiments/second.ts',
  })
})

test('getExperiment throws when the experiment is not found', async () => {
  const host = VirtualHost.create({
    '/experiments': {},
  })

  await expect(getExperiment(host, '/experiments', 'missing')).rejects.toThrowError(
    'Experiment "missing" was not found in: /experiments',
  )
})
