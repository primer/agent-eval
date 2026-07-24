import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {describe, expect, test} from 'vitest'
import {findExperiment, listExperiments, loadExperimentConfigs} from './experiments'

async function createExperimentsDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-eval-experiments-'))
  await fs.writeFile(
    path.join(directory, 'example.mjs'),
    `export const experiment = {
      name: 'Example',
      description: 'Example experiment',
      models: [{name: 'gpt-5.5', reasoningEfforts: ['high']}],
      scenarios: ['001-agent-uses-button-from-primer'],
      treatments: []
    }`,
  )
  await fs.writeFile(
    path.join(directory, 'default-export.mjs'),
    `export default {
      name: 'Default export',
      description: 'Default export experiment',
      models: [{name: 'gpt-5.5', reasoningEfforts: ['high']}],
      scenarios: ['001-agent-uses-button-from-primer'],
      treatments: []
    }`,
  )
  await fs.writeFile(path.join(directory, 'index.ts'), 'throw new Error("index should be ignored")')
  return directory
}

describe('local experiment loading', () => {
  test('lists experiments from a local directory', async () => {
    const directory = await createExperimentsDirectory()

    await expect(listExperiments({directory})).resolves.toEqual([
      ['default-export', expect.objectContaining({name: 'Default export'})],
      ['example', expect.objectContaining({name: 'Example'})],
    ])
  })

  test('finds a named experiment from a local directory', async () => {
    const directory = await createExperimentsDirectory()

    await expect(findExperiment('example', {directory})).resolves.toEqual(expect.objectContaining({name: 'Example'}))
  })

  test('finds an experiment from a local file path', async () => {
    const directory = await createExperimentsDirectory()

    await expect(findExperiment(path.join(directory, 'example.mjs'))).resolves.toEqual(
      expect.objectContaining({name: 'Example'}),
    )
  })

  test('returns undefined when an experiment is not found', async () => {
    const directory = await createExperimentsDirectory()

    await expect(findExperiment('missing', {directory})).resolves.toBeUndefined()
  })

  test('loads an experiment from a local file path', async () => {
    const directory = await createExperimentsDirectory()

    await expect(loadExperimentConfigs({experiment: path.join(directory, 'example.mjs')})).resolves.toEqual([
      expect.objectContaining({name: 'Example'}),
    ])
  })

  test('loads all experiments when no experiment is specified', async () => {
    const directory = await createExperimentsDirectory()

    await expect(loadExperimentConfigs({directory})).resolves.toHaveLength(2)
  })
})
