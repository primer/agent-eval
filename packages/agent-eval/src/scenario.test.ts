import {test, expect} from 'vitest'
import {VirtualHost} from './host'
import {listScenarios, getScenario, defineConfig} from './scenario'
import type {Rubric} from './rubric'

test('listScenarios', async () => {
  const config = JSON.stringify(
    defineConfig({
      prompt: 'test',
    }),
  )
  const host = VirtualHost.create({
    '/scenarios': {
      '.hidden-directory': {},
      '.hidden-file': '',
      '001-scenario': {
        'package.json': '{}',
        'scenario.config.ts': `export default ${config}`,
        'scenario.test.ts': '',
      },
      '002-missing-package-json': {
        'scenario.config.ts': `export default ${config}`,
        'scenario.test.ts': '',
      },
      '003-missing-config': {
        'package.json': '{}',
        'scenario.test.ts': '',
      },
      '004-invalid-config': {
        'package.json': '{}',
        'scenario.config.ts': '',
      },
      '005-missing-test': {
        'package.json': '{}',
        'scenario.config.ts': `export default ${config}`,
      },
    },
  })
  const scenarios = await listScenarios(host, '/scenarios')

  expect(scenarios).toHaveLength(1)
  expect(scenarios).toContainEqual({
    id: '001-scenario',
    directory: '/scenarios/001-scenario',
    prompt: 'test',
    tags: [],
    testPath: '/scenarios/001-scenario/scenario.test.ts',
  })

  expect(scenarios).not.toContainEqual(expect.objectContaining({id: '.hidden-directory'}))
  expect(scenarios).not.toContainEqual(expect.objectContaining({id: '.hidden-file'}))
  expect(scenarios).not.toContainEqual(expect.objectContaining({id: '002-missing-package-json'}))
  expect(scenarios).not.toContainEqual(expect.objectContaining({id: '003-missing-config'}))
  expect(scenarios).not.toContainEqual(expect.objectContaining({id: '004-invalid-config'}))
  expect(scenarios).not.toContainEqual(expect.objectContaining({id: '005-missing-test'}))
})

test('listScenarios includes optional metadata and browser tests', async () => {
  const config = JSON.stringify(
    defineConfig({
      description: 'Test scenario',
      prompt: 'Complete the task',
      tags: ['test', 'browser'],
    }),
  )
  const host = VirtualHost.create({
    '/scenarios': {
      '001-scenario': {
        'browser.test.ts': '',
        'package.json': '{}',
        'scenario.config.ts': `export default ${config}`,
        'scenario.test.ts': '',
      },
    },
  })

  await expect(listScenarios(host, '/scenarios')).resolves.toEqual([
    {
      id: '001-scenario',
      directory: '/scenarios/001-scenario',
      prompt: 'Complete the task',
      description: 'Test scenario',
      tags: ['test', 'browser'],
      testPath: '/scenarios/001-scenario/scenario.test.ts',
      browserTestPath: '/scenarios/001-scenario/browser.test.ts',
    },
  ])
})

test('listScenarios includes an optional rubric', async () => {
  const rubric = {
    judge: {
      name: 'gpt-5.5',
      reasoningEffort: 'high',
    },
    criteria: [
      {
        name: 'Correctness',
        weight: 1,
        minimumScore: 4,
        scores: {
          1: 'Incorrect',
          2: 'Major issues',
          3: 'Partial',
          4: 'Correct',
          5: 'Complete',
        },
      },
    ],
  } satisfies Rubric
  const config = JSON.stringify(
    defineConfig({
      prompt: 'Complete the task',
      rubric,
    }),
  )
  const host = VirtualHost.create({
    '/scenarios': {
      '001-scenario': {
        'package.json': '{}',
        'scenario.config.ts': `export default ${config}`,
        'scenario.test.ts': '',
      },
    },
  })

  await expect(listScenarios(host, '/scenarios')).resolves.toEqual([
    {
      id: '001-scenario',
      directory: '/scenarios/001-scenario',
      prompt: 'Complete the task',
      rubric,
      tags: [],
      testPath: '/scenarios/001-scenario/scenario.test.ts',
    },
  ])
})

test('listScenarios sorts scenarios by directory name', async () => {
  const config = JSON.stringify(
    defineConfig({
      prompt: 'test',
    }),
  )
  const host = VirtualHost.create({
    '/scenarios': {
      '002-last': {
        'package.json': '{}',
        'scenario.config.ts': `export default ${config}`,
        'scenario.test.ts': '',
      },
      '001-first': {
        'package.json': '{}',
        'scenario.config.ts': `export default ${config}`,
        'scenario.test.ts': '',
      },
    },
  })

  const scenarios = await listScenarios(host, '/scenarios')

  expect(
    scenarios.map(scenario => {
      return scenario.id
    }),
  ).toEqual(['001-first', '002-last'])
})

test('listScenarios ignores configs without a default export', async () => {
  const config = JSON.stringify(
    defineConfig({
      prompt: 'test',
    }),
  )
  const host = VirtualHost.create({
    '/scenarios': {
      '001-scenario': {
        'package.json': '{}',
        'scenario.config.ts': `export const scenario = ${config}`,
        'scenario.test.ts': '',
      },
    },
  })

  await expect(listScenarios(host, '/scenarios')).resolves.toEqual([])
})

test('listScenarios excludes template directories', async () => {
  const config = JSON.stringify(
    defineConfig({
      prompt: 'test',
    }),
  )
  const host = VirtualHost.create({
    '/scenarios': {
      '000-template': {
        'package.json': '{}',
        'scenario.config.ts': `export default ${config}`,
        'scenario.test.ts': '',
      },
    },
  })

  await expect(listScenarios(host, '/scenarios')).resolves.toEqual([])
})

test('throws if input is not a directory', async () => {
  const host = VirtualHost.create({
    '/test': '',
  })

  await expect(() => listScenarios(host, '/test')).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: Expected scenarios path to be a directory]`,
  )
})

test('getScenario', async () => {
  const config = JSON.stringify(
    defineConfig({
      prompt: 'test',
    }),
  )
  const host = VirtualHost.create({
    '/scenarios': {
      '001-scenario': {
        'package.json': '{}',
        'scenario.config.ts': `export default ${config}`,
        'scenario.test.ts': '',
      },
      '002-scenario': {
        'package.json': '{}',
        'scenario.config.ts': `export default ${config}`,
        'scenario.test.ts': '',
      },
    },
  })

  await expect(getScenario(host, '/scenarios', '001-scenario')).resolves.toEqual({
    id: '001-scenario',
    directory: '/scenarios/001-scenario',
    prompt: 'test',
    tags: [],
    testPath: '/scenarios/001-scenario/scenario.test.ts',
  })

  await expect(getScenario(host, '/scenarios', '002-scenario')).resolves.toEqual({
    id: '002-scenario',
    directory: '/scenarios/002-scenario',
    prompt: 'test',
    tags: [],
    testPath: '/scenarios/002-scenario/scenario.test.ts',
  })

  await expect(getScenario(host, '/scenarios', '003-scenario')).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: Scenario "003-scenario" was not found in: /scenarios]`,
  )
})

test('getScenario throws if input is not a directory', async () => {
  const host = VirtualHost.create({
    '/test': '',
  })

  await expect(() => getScenario(host, '/test', '001-scenario')).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: Expected scenarios path to be a directory]`,
  )
})
