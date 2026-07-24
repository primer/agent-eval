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

async function createScenario(scenariosDirectory: string, id: string, prompt: string) {
  const directory = path.join(scenariosDirectory, id)
  await fs.mkdir(directory)
  await fs.writeFile(path.join(directory, 'scenario.config.ts'), `export default {prompt: ${JSON.stringify(prompt)}}`)
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
