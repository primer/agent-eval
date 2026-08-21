import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {describe, expect, test} from 'vitest'
import {findBenchmark, listBenchmarks, loadBenchmarkConfigs} from './benchmarks'

async function createBenchmarksDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-eval-benchmarks-'))
  await fs.writeFile(
    path.join(directory, 'example.mjs'),
    `export const benchmark = {
      name: 'Example',
      description: 'Example benchmark',
      models: [{name: 'gpt-5.5', reasoningEfforts: ['high']}],
      capabilities: [{
        name: 'Edits files',
        description: 'Evaluates file editing',
        scenarios: ['001-agent-uses-button-from-primer']
      }]
    }`,
  )
  await fs.writeFile(
    path.join(directory, 'default-export.mjs'),
    `export default {
      name: 'Default export',
      description: 'Default export benchmark',
      models: [{name: 'gpt-5.5', reasoningEfforts: ['high']}],
      capabilities: []
    }`,
  )
  await fs.writeFile(path.join(directory, 'index.ts'), 'throw new Error("index should be ignored")')
  return directory
}

describe('local benchmark loading', () => {
  test('lists benchmarks from a local directory', async () => {
    const directory = await createBenchmarksDirectory()

    await expect(listBenchmarks({directory})).resolves.toEqual([
      ['default-export', expect.objectContaining({name: 'Default export'})],
      ['example', expect.objectContaining({name: 'Example'})],
    ])
  })

  test('finds a named benchmark from a local directory', async () => {
    const directory = await createBenchmarksDirectory()

    await expect(findBenchmark('example', {directory})).resolves.toEqual(expect.objectContaining({name: 'Example'}))
  })

  test('finds a benchmark from a local file path', async () => {
    const directory = await createBenchmarksDirectory()

    await expect(findBenchmark(path.join(directory, 'example.mjs'))).resolves.toEqual(
      expect.objectContaining({name: 'Example'}),
    )
  })

  test('returns undefined when a benchmark is not found', async () => {
    const directory = await createBenchmarksDirectory()

    await expect(findBenchmark('missing', {directory})).resolves.toBeUndefined()
  })

  test('loads a benchmark from a local file path', async () => {
    const directory = await createBenchmarksDirectory()

    await expect(loadBenchmarkConfigs({benchmark: path.join(directory, 'example.mjs')})).resolves.toEqual([
      expect.objectContaining({name: 'Example'}),
    ])
  })

  test('loads all benchmarks when no benchmark is specified', async () => {
    const directory = await createBenchmarksDirectory()

    await expect(loadBenchmarkConfigs({directory})).resolves.toHaveLength(2)
  })
})
