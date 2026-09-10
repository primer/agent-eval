import fs from 'node:fs/promises'
import path from 'node:path'
import type {ExperimentOutput} from '@primer/agent-eval/experiment'
import {read} from '@primer/agent-eval/experiment'
import {afterEach, beforeEach, expect, test, vi} from 'vitest'

vi.mock('@primer/agent-eval/experiment', () => {
  return {read: vi.fn()}
})

let directory: string
let getLatestForExperiment: (typeof import('./runs'))['getLatestForExperiment']

beforeEach(async () => {
  vi.resetAllMocks()
  vi.resetModules()
  const temporaryDirectory = path.resolve('.agents/tmp')
  await fs.mkdir(temporaryDirectory, {recursive: true})
  directory = await fs.mkdtemp(path.join(temporaryDirectory, 'experiment-runs-'))
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(path.join(directory, 'website'))
  try {
    getLatestForExperiment = (await import('./runs')).getLatestForExperiment
  } finally {
    cwd.mockRestore()
  }
  vi.mocked(read).mockResolvedValue({
    experimentId: 'example',
    scenarios: new Map(),
    treatments: new Map(),
    trials: new Map(),
  } satisfies ExperimentOutput)
})

afterEach(async () => {
  await fs.rm(directory, {recursive: true, force: true})
})

async function createRunDirectory(date: string, withOutput = true): Promise<string> {
  const runDirectory = path.join(directory, 'results/experiments/example', date)
  await fs.mkdir(runDirectory, {recursive: true})
  const outputPath = path.join(runDirectory, 'output.json')
  if (withOutput) {
    await fs.writeFile(outputPath, '{}')
  }
  return outputPath
}

test('reads only the newest available run, including an empty latest run', async () => {
  await createRunDirectory('2026-09-08')
  const latest = await createRunDirectory('2026-09-10')
  await createRunDirectory('2026-09-09')

  expect(await getLatestForExperiment('example')).toMatchObject({
    name: '2026-09-10',
    output: {results: []},
  })
  expect(read).toHaveBeenCalledTimes(1)
  expect(read).toHaveBeenCalledWith(latest)
})

test('skips invalid dates, files, and directories without a result manifest', async () => {
  await createRunDirectory('2026-09-12', false)
  await createRunDirectory('2026-13-01')
  await createRunDirectory('2026-02-30')
  await createRunDirectory('not-a-date')
  const latest = await createRunDirectory('2026-09-10')
  await fs.writeFile(path.join(directory, 'results/experiments/example/2026-09-11'), '')

  expect(await getLatestForExperiment('example')).toMatchObject({name: '2026-09-10'})
  expect(read).toHaveBeenCalledTimes(1)
  expect(read).toHaveBeenCalledWith(latest)
})

test('returns no run when no result bundles exist', async () => {
  expect(await getLatestForExperiment('example')).toBeNull()
  await createRunDirectory('2026-09-10', false)
  expect(await getLatestForExperiment('example')).toBeNull()
  expect(read).not.toHaveBeenCalled()
})

test('skips a bundle belonging to a different experiment', async () => {
  const older = await createRunDirectory('2026-09-09')
  const latest = await createRunDirectory('2026-09-10')
  vi.mocked(read).mockResolvedValueOnce({
    experimentId: 'other',
    scenarios: new Map(),
    treatments: new Map(),
    trials: new Map(),
  })

  expect(await getLatestForExperiment('example')).toMatchObject({name: '2026-09-09'})
  expect(read).toHaveBeenNthCalledWith(1, latest)
  expect(read).toHaveBeenNthCalledWith(2, older)
})

test('propagates errors in the latest bundle without falling back to older results', async () => {
  await createRunDirectory('2026-09-09')
  const latest = await createRunDirectory('2026-09-10')
  vi.mocked(read).mockRejectedValue(new Error('Invalid result bundle'))

  await expect(getLatestForExperiment('example')).rejects.toThrow('Invalid result bundle')
  expect(read).toHaveBeenCalledTimes(1)
  expect(read).toHaveBeenCalledWith(latest)
})
