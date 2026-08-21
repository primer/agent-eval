import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {afterEach, describe, expect, test} from 'vitest'
import {findScenario, listScenarios} from './scenarios'

const temporaryDirectories: Array<string> = []

async function createScenariosDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-eval-scenarios-'))
  temporaryDirectories.push(directory)
  return directory
}

async function createScenario(
  scenariosDirectory: string,
  id: string,
  prompt: string,
  tags?: Array<string>,
  description?: string,
) {
  const directory = path.join(scenariosDirectory, id)
  await fs.mkdir(directory)
  await fs.writeFile(
    path.join(directory, 'scenario.config.ts'),
    `export default ${JSON.stringify({description, prompt, ...(tags ? {tags} : {})})}`,
  )
  await fs.writeFile(path.join(directory, 'scenario.test.ts'), '')
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => {
      return fs.rm(directory, {recursive: true, force: true})
    }),
  )
})

describe('scenario loading', () => {
  test('lists scenarios from the provided directory', async () => {
    const scenariosDirectory = await createScenariosDirectory()
    await createScenario(scenariosDirectory, 'second', 'Second prompt')
    await createScenario(scenariosDirectory, 'first', 'First prompt')
    await fs.writeFile(path.join(scenariosDirectory, 'README.md'), '')

    await expect(listScenarios({directory: scenariosDirectory})).resolves.toEqual([
      expect.objectContaining({id: 'first', config: {prompt: 'First prompt'}}),
      expect.objectContaining({id: 'second', config: {prompt: 'Second prompt'}}),
    ])
  })

  test('loads scenario descriptions', async () => {
    const scenariosDirectory = await createScenariosDirectory()
    await createScenario(scenariosDirectory, 'example', 'Example prompt', undefined, 'Example description')

    await expect(findScenario('example', {directory: scenariosDirectory})).resolves.toMatchObject({
      config: {
        description: 'Example description',
        prompt: 'Example prompt',
      },
    })
  })

  test('rejects non-string scenario descriptions', async () => {
    const scenariosDirectory = await createScenariosDirectory()
    const directory = await createScenario(scenariosDirectory, 'example', 'Example prompt')
    await fs.writeFile(
      path.join(directory, 'scenario.config.ts'),
      `export default {description: 42, prompt: 'Example prompt'}`,
    )

    await expect(findScenario('example', {directory: scenariosDirectory})).rejects.toThrow(
      'Scenario "example" config must export a default config with a string prompt, optional string description, optional string[] tags, and optional turns',
    )
  })

  test('loads follow-up turns and their tests', async () => {
    const scenariosDirectory = await createScenariosDirectory()
    const directory = await createScenario(scenariosDirectory, 'example', 'Make the button blue')
    await fs.writeFile(
      path.join(directory, 'scenario.config.ts'),
      `export default {
        prompt: 'Make the button blue',
        turns: [{
          prompt: 'Actually, make it red',
          test: 'red.test.ts',
          browserTest: 'red.browser.test.ts'
        }]
      }`,
    )
    await fs.writeFile(path.join(directory, 'red.test.ts'), '')
    await fs.writeFile(path.join(directory, 'red.browser.test.ts'), '')

    await expect(findScenario('example', {directory: scenariosDirectory})).resolves.toMatchObject({
      turns: [
        {
          prompt: 'Actually, make it red',
          testPath: path.join(directory, 'red.test.ts'),
          browserTestPath: path.join(directory, 'red.browser.test.ts'),
        },
      ],
    })
  })

  test('rejects turns without a prompt and test', async () => {
    const scenariosDirectory = await createScenariosDirectory()
    const directory = await createScenario(scenariosDirectory, 'example', 'Make the button blue')
    await fs.writeFile(
      path.join(directory, 'scenario.config.ts'),
      `export default {prompt: 'Make the button blue', turns: [{prompt: 'Make it red'}]}`,
    )

    await expect(findScenario('example', {directory: scenariosDirectory})).rejects.toThrow(
      'Scenario "example" config must export a default config with a string prompt, optional string description, optional string[] tags, and optional turns',
    )
  })

  test('lists scenarios that match all provided tags', async () => {
    const scenariosDirectory = await createScenariosDirectory()
    await createScenario(scenariosDirectory, 'both', 'Both tags', ['baseline', 'primer'])
    await createScenario(scenariosDirectory, 'baseline', 'Baseline only', ['baseline'])
    await createScenario(scenariosDirectory, 'untagged', 'No tags')

    await expect(listScenarios({directory: scenariosDirectory, tags: ['baseline', 'primer']})).resolves.toEqual([
      expect.objectContaining({id: 'both'}),
    ])
  })

  test('lists all scenarios when no tags are provided', async () => {
    const scenariosDirectory = await createScenariosDirectory()
    await createScenario(scenariosDirectory, 'tagged', 'Tagged', ['baseline'])
    await createScenario(scenariosDirectory, 'untagged', 'Untagged')

    await expect(listScenarios({directory: scenariosDirectory, tags: []})).resolves.toEqual([
      expect.objectContaining({id: 'tagged'}),
      expect.objectContaining({id: 'untagged'}),
    ])
  })

  test('finds a scenario by id in the provided directory', async () => {
    const scenariosDirectory = await createScenariosDirectory()
    const directory = await createScenario(scenariosDirectory, 'example', 'Example prompt')

    await expect(findScenario('example', {directory: scenariosDirectory})).resolves.toEqual({
      id: 'example',
      directory,
      config: {prompt: 'Example prompt'},
      testPath: path.join(directory, 'scenario.test.ts'),
    })
  })

  test('includes an optional browser test', async () => {
    const scenariosDirectory = await createScenariosDirectory()
    const directory = await createScenario(scenariosDirectory, 'example', 'Example prompt')
    const browserTestPath = path.join(directory, 'scenario.browser.test.ts')
    await fs.writeFile(browserTestPath, '')

    await expect(findScenario('example', {directory: scenariosDirectory})).resolves.toEqual({
      id: 'example',
      directory,
      config: {prompt: 'Example prompt'},
      testPath: path.join(directory, 'scenario.test.ts'),
      browserTestPath,
    })
  })

  test('returns undefined when a scenario is not found', async () => {
    const scenariosDirectory = await createScenariosDirectory()

    await expect(findScenario('missing-scenario', {directory: scenariosDirectory})).resolves.toBeUndefined()
  })

  test('returns undefined when a scenario id is not a direct child directory', async () => {
    const scenariosDirectory = await createScenariosDirectory()
    const siblingDirectory = await createScenariosDirectory()
    await createScenario(siblingDirectory, 'example', 'Example prompt')

    await expect(
      findScenario(path.relative(scenariosDirectory, path.join(siblingDirectory, 'example')), {
        directory: scenariosDirectory,
      }),
    ).resolves.toBeUndefined()
  })

  test('throws when the scenarios directory does not exist', async () => {
    const scenariosDirectory = await createScenariosDirectory()
    const missingDirectory = path.join(scenariosDirectory, 'missing')

    await expect(findScenario('example', {directory: missingDirectory})).rejects.toThrow(
      `Scenarios directory does not exist: ${missingDirectory}`,
    )
  })
})
