import fs from 'node:fs/promises'
import path from 'node:path'
import type {BenchmarkOutput, ExperimentOutput} from '@primer/agent-eval'
import {afterEach, expect, onTestFinished, test, vi} from 'vitest'
import {readBenchmarkOutput, readExperimentOutput} from './result-files'
import {createBenchmarkOutput, createExperimentOutput, createTrial} from './test-fixtures'
import {createExperimentRunDetails, getWalkthroughDataUrls} from './run-details'

afterEach(() => {
  vi.restoreAllMocks()
})

async function createDirectory(): Promise<string> {
  const root = path.resolve('.agents/tmp')
  await fs.mkdir(root, {recursive: true})
  const directory = await fs.mkdtemp(path.join(root, 'website-results-'))
  onTestFinished(async () => {
    await fs.rm(directory, {recursive: true, force: true})
  })
  return directory
}

async function writeBundle(
  directory: string,
  output: ExperimentOutput & {capabilities?: BenchmarkOutput['capabilities']},
): Promise<string> {
  const trialPaths = new Map<string, string>()
  await fs.mkdir(directory, {recursive: true})
  for (const [id, trial] of output.trials) {
    const trialPath = `artifacts/${id}/${id}.json`
    await fs.mkdir(path.dirname(path.join(directory, trialPath)), {recursive: true})
    await fs.writeFile(path.join(directory, trialPath), JSON.stringify(trial))
    trialPaths.set(id, trialPath)
  }
  const filepath = path.join(directory, 'output.json')
  await fs.writeFile(
    filepath,
    JSON.stringify({
      id: output.id,
      scenarios: Object.fromEntries(output.scenarios),
      treatments: Object.fromEntries(output.treatments),
      trials: Object.fromEntries(trialPaths),
      ...(output.capabilities ? {capabilities: Object.fromEntries(output.capabilities)} : {}),
    }),
  )
  return filepath
}

test.each(['benchmark', 'experiment'] as const)(
  'reads a portable %s bundle repeatedly without deleting artifacts',
  async kind => {
    const directory = await createDirectory()
    const benchmark = createBenchmarkOutput([createTrial(), {...createTrial({id: 'trial-2'}), capabilityId: 'b'}])
    const output = kind === 'benchmark' ? benchmark : createExperimentOutput()
    const filepath = await writeBundle(directory, output)
    const before = await fs.readFile(path.join(directory, 'artifacts/trial-1/trial-1.json'), 'utf8')
    const read = kind === 'benchmark' ? readBenchmarkOutput : readExperimentOutput
    expect(await read(filepath)).toEqual(output)
    const bundle = await read(filepath)
    expect(bundle).toEqual(output)
    expect(await fs.readFile(path.join(directory, 'artifacts/trial-1/trial-1.json'), 'utf8')).toBe(before)
    if (bundle === null) {
      throw new Error('Expected an available bundle')
    }
    const details = await createExperimentRunDetails('2026-09-15', bundle, directory)
    expect(details.results[0].checks).toEqual([...output.trials.values()][0].checks)
  },
)

test.each([
  {key: 'benchmarkId', read: readBenchmarkOutput},
  {key: 'experimentId', read: readExperimentOutput},
])('skips legacy $key bundles with a warning without changing their files', async ({key, read}) => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const directory = await createDirectory()
  const filepath = path.join(directory, 'output.json')
  const contents = JSON.stringify({[key]: 'legacy-run', trials: {}})
  await fs.writeFile(filepath, contents)
  expect(await read(filepath)).toBeNull()
  expect(warn).toHaveBeenCalledWith(expect.stringContaining(`incompatible data in "${filepath}"`))
  expect(await fs.readFile(filepath, 'utf8')).toBe(contents)
})

test('skips invalid current schemas and malformed JSON with distinct warnings', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const directory = await createDirectory()
  const filepath = path.join(directory, 'output.json')
  await fs.writeFile(filepath, JSON.stringify({id: 'current'}))
  expect(await readExperimentOutput(filepath)).toBeNull()
  expect(warn).toHaveBeenLastCalledWith(expect.stringContaining('incompatible data'))
  await fs.writeFile(filepath, '{')
  expect(await readExperimentOutput(filepath)).toBeNull()
  expect(warn).toHaveBeenLastCalledWith(expect.stringContaining('invalid JSON'))
})

test.each(['benchmark', 'experiment'] as const)(
  'skips the entire %s bundle when any trial has an incompatible shape',
  async kind => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const directory = await createDirectory()
    const trials = [createTrial(), createTrial({id: 'invalid'})]
    const output = kind === 'benchmark' ? createBenchmarkOutput(trials) : createExperimentOutput(trials)
    const filepath = await writeBundle(directory, output)
    const invalidPath = path.join(directory, 'artifacts/invalid/invalid.json')
    await fs.writeFile(invalidPath, JSON.stringify({id: 'invalid'}))
    const read = kind === 'benchmark' ? readBenchmarkOutput : readExperimentOutput
    expect(await read(filepath)).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(invalidPath))
    expect(await fs.readFile(path.join(directory, 'artifacts/trial-1/trial-1.json'), 'utf8')).toContain('trial-1')
  },
)

test('does not infer omitted capability IDs even when only one capability matches', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const directory = await createDirectory()
  const output = createBenchmarkOutput()
  output.capabilities.delete('b')
  const filepath = await writeBundle(directory, output)
  const json: Record<string, unknown> = {...output.trials.get('trial-1')}
  delete json.capabilityId
  await fs.writeFile(path.join(directory, 'artifacts/trial-1/trial-1.json'), JSON.stringify(json))
  expect(await readBenchmarkOutput(filepath)).toBeNull()
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('capabilityId'))
})

test.each(['benchmarks', 'experiments'] as const)(
  'excludes incompatible %s bundles from run discovery',
  async collection => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const directory = await createDirectory()
    const output = collection === 'benchmarks' ? createBenchmarkOutput() : createExperimentOutput()
    const results = path.join(directory, 'results', collection, output.id)
    await writeBundle(path.join(results, '2026-09-15'), output)
    await fs.mkdir(path.join(results, '2026-09-16'))
    await fs.writeFile(path.join(results, '2026-09-16/output.json'), '{"oldShape":true}')
    vi.spyOn(process, 'cwd').mockReturnValue(path.join(directory, 'website'))
    vi.resetModules()
    const runs =
      collection === 'benchmarks'
        ? await (await import('./benchmark-results')).listBenchmarkRuns(output.id)
        : await (await import('./runs')).listForExperiment(output.id)
    expect(
      runs.map(run => {
        return run.name
      }),
    ).toEqual(['2026-09-15'])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('2026-09-16/output.json'))
  },
)

test('rejects missing trial files, mismatched IDs, and paths outside the bundle', async () => {
  const directory = await createDirectory()
  const bundle = path.join(directory, 'bundle')
  await fs.mkdir(bundle)
  const filepath = path.join(bundle, 'output.json')
  const output = createExperimentOutput()
  const manifest = {
    id: output.id,
    scenarios: Object.fromEntries(output.scenarios),
    treatments: Object.fromEntries(output.treatments),
    trials: {'trial-1': 'missing.json'},
  }
  await fs.writeFile(filepath, JSON.stringify(manifest))
  await expect(readExperimentOutput(filepath)).rejects.toThrow('ENOENT')
  const trial = [...output.trials.values()][0]
  await fs.writeFile(path.join(bundle, 'trial.json'), JSON.stringify({...trial, id: 'wrong'}))
  manifest.trials['trial-1'] = 'trial.json'
  await fs.writeFile(filepath, JSON.stringify(manifest))
  await expect(readExperimentOutput(filepath)).rejects.toThrow('does not match manifest ID')
  await fs.writeFile(path.join(directory, 'outside.json'), JSON.stringify(trial))
  for (const relativePath of ['../outside.json', path.join(directory, 'outside.json')]) {
    manifest.trials['trial-1'] = relativePath
    await fs.writeFile(filepath, JSON.stringify(manifest))
    await expect(readExperimentOutput(filepath)).rejects.toThrow(/outside the result bundle|bundle-relative path/)
  }
  await fs.symlink(path.join(directory, 'outside.json'), path.join(bundle, 'linked.json'))
  manifest.trials['trial-1'] = 'linked.json'
  await fs.writeFile(filepath, JSON.stringify(manifest))
  await expect(readExperimentOutput(filepath)).rejects.toThrow('outside the result bundle')
})

test('loads screenshot and video artifacts relative to a relocated run', async () => {
  const directory = await createDirectory()
  const media = 'artifacts/trial-1/walkthrough/image.jpg'
  await fs.mkdir(path.dirname(path.join(directory, media)), {recursive: true})
  await fs.writeFile(path.join(directory, media), 'image')
  expect(await getWalkthroughDataUrls({type: 'Screenshot', filepath: media}, directory)).toEqual({
    type: 'Screenshot',
    screenshot: `data:image/jpeg;base64,${Buffer.from('image').toString('base64')}`,
  })
  const artifacts = '/another-machine/results/artifacts/trial-1/walkthrough'
  expect(
    await getWalkthroughDataUrls({type: 'Screenshot', filepath: 'walkthrough/image.jpg'}, directory, artifacts),
  ).toEqual({
    type: 'Screenshot',
    screenshot: `data:image/jpeg;base64,${Buffer.from('image').toString('base64')}`,
  })
  expect(await getWalkthroughDataUrls({type: 'Screenshots', screenshots: [media]}, directory)).toEqual({
    type: 'Screenshots',
    screenshots: [`data:image/jpeg;base64,${Buffer.from('image').toString('base64')}`],
  })
  const video = 'artifacts/trial-1/walkthrough/video.webm'
  await fs.writeFile(path.join(directory, video), 'video')
  expect(await getWalkthroughDataUrls({type: 'Video', filepath: video}, directory)).toEqual({
    type: 'Video',
    video: `data:video/webm;base64,${Buffer.from('video').toString('base64')}`,
  })
  expect(
    await getWalkthroughDataUrls({type: 'Screenshots', screenshots: ['walkthrough/image.jpg']}, directory, artifacts),
  ).toEqual({
    type: 'Screenshots',
    screenshots: [`data:image/jpeg;base64,${Buffer.from('image').toString('base64')}`],
  })
  expect(
    await getWalkthroughDataUrls({type: 'Video', filepath: 'walkthrough/video.webm'}, directory, artifacts),
  ).toEqual({
    type: 'Video',
    video: `data:video/webm;base64,${Buffer.from('video').toString('base64')}`,
  })
  expect(await getWalkthroughDataUrls({type: 'Screenshot', filepath: 'missing.png'}, directory)).toEqual({
    type: 'Unavailable',
  })
})
