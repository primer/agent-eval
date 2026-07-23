import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {afterEach, describe, expect, test} from 'vitest'
import {resolveExperimentScenario} from './scenario'

const temporaryDirectories: Array<string> = []

async function createTemporaryDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-eval-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => {
      return fs.rm(directory, {recursive: true, force: true})
    }),
  )
})

describe(resolveExperimentScenario, () => {
  test('resolves named scenarios from the provided directory', async () => {
    const scenariosDirectory = await createTemporaryDirectory()
    const directory = path.join(scenariosDirectory, 'button-scenario')
    await fs.mkdir(directory)
    await fs.writeFile(path.join(directory, 'scenario.config.ts'), `export default {prompt: 'Use a button'}`)
    await fs.writeFile(path.join(directory, 'scenario.test.ts'), '')

    await expect(
      resolveExperimentScenario('button-scenario', {
        directory: scenariosDirectory,
      }),
    ).resolves.toEqual({
      id: 'button-scenario',
      directory,
      config: {
        prompt: 'Use a button',
      },
      testPath: path.join(directory, 'scenario.test.ts'),
    })
  })

  test('resolves inline scenario directories relative to the provided cwd', async () => {
    const cwd = await createTemporaryDirectory()
    const directory = path.join(cwd, 'scenarios', 'local-scenario')
    await fs.mkdir(directory, {recursive: true})
    await fs.writeFile(path.join(directory, 'scenario.config.mjs'), `export default {prompt: 'Use ignored config'}`)
    await fs.writeFile(
      path.join(directory, 'scenario.config.ts'),
      `export default {prompt: 'Update the local project'}`,
    )
    await fs.writeFile(path.join(directory, 'scenario.test.ts'), '')

    await expect(
      resolveExperimentScenario(
        {
          name: 'local-scenario',
          path: 'scenarios/local-scenario',
        },
        {
          cwd,
        },
      ),
    ).resolves.toEqual({
      id: 'local-scenario',
      directory,
      config: {
        prompt: 'Update the local project',
      },
      testPath: path.join(directory, 'scenario.test.ts'),
    })
  })

  test('defaults inline scenario names to the directory name', async () => {
    const cwd = await createTemporaryDirectory()
    const directory = path.join(cwd, 'scenarios', 'local-button-scenario')
    await fs.mkdir(directory, {recursive: true})
    await fs.writeFile(
      path.join(directory, 'scenario.config.ts'),
      `export default {prompt: 'Update the local project'}`,
    )
    await fs.writeFile(path.join(directory, 'scenario.test.ts'), '')

    await expect(
      resolveExperimentScenario(
        {
          path: './scenarios/local-button-scenario',
        },
        {
          cwd,
        },
      ),
    ).resolves.toMatchObject({
      id: 'local-button-scenario',
      directory,
    })
  })

  test('requires inline scenarios to use the default scenario file structure', async () => {
    const cwd = await createTemporaryDirectory()
    const directory = path.join(cwd, 'fixtures', 'local-scenario')
    await fs.mkdir(directory, {recursive: true})
    await fs.writeFile(path.join(directory, 'scenario.config.ts'), `export default {prompt: 'Use default config'}`)
    await fs.writeFile(path.join(directory, 'custom.test.ts'), '')

    await expect(
      resolveExperimentScenario(
        {
          name: 'local-scenario',
          path: 'fixtures/local-scenario',
        },
        {
          cwd,
        },
      ),
    ).rejects.toThrow(`Scenario "local-scenario" test file was not found: ${path.join(directory, 'scenario.test.ts')}`)
  })
})
