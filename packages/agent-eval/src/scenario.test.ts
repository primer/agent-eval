import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {afterEach, describe, expect, test} from 'vitest'
import type {ExperimentScenarioConfig} from '@primer/agent-experiment'
import {resolveExperimentScenario, type ResolvedScenario} from './scenario'

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
  test('resolves built-in scenarios through the provided resolver', async () => {
    const builtinScenario: ResolvedScenario = {
      id: '001-agent-uses-button-from-primer',
      directory: '/path/to/scenario',
      config: {
        prompt: 'Use a Primer button',
      },
      testPath: '/path/to/scenario/scenario.test.ts',
    }

    await expect(
      resolveExperimentScenario('001-agent-uses-button-from-primer' as ExperimentScenarioConfig, {
        builtInScenarioResolver(id) {
          expect(id).toBe('001-agent-uses-button-from-primer')
          return builtinScenario
        },
      }),
    ).resolves.toBe(builtinScenario)
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
          builtInScenarioResolver() {
            throw new Error('Unexpected built-in scenario lookup')
          },
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
          builtInScenarioResolver() {
            throw new Error('Unexpected built-in scenario lookup')
          },
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
          builtInScenarioResolver() {
            throw new Error('Unexpected built-in scenario lookup')
          },
          cwd,
        },
      ),
    ).rejects.toThrow(`Scenario "local-scenario" test file was not found: ${path.join(directory, 'scenario.test.ts')}`)
  })
})
