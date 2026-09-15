import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, onTestFinished, test} from 'vitest'
import {readBenchmarkOutput, readExperimentOutput} from './result-files'
import {createBenchmarkOutput, createExperimentOutput} from './test-fixtures'
import {createExperimentRunDetails, getWalkthroughDataUrls} from './run-details'

async function createDirectory(): Promise<string> {
  const root = path.resolve('.agents/tmp')
  await fs.mkdir(root, {recursive: true})
  const directory = await fs.mkdtemp(path.join(root, 'website-results-'))
  onTestFinished(async () => {
    await fs.rm(directory, {recursive: true, force: true})
  })
  return directory
}

test.each(['benchmark', 'experiment'] as const)(
  'reads a portable %s bundle repeatedly without deleting artifacts',
  async kind => {
    const directory = await createDirectory()
    const benchmark = createBenchmarkOutput()
    const output = kind === 'benchmark' ? benchmark : createExperimentOutput()
    const trialPaths = new Map<string, string>()
    for (const [id, trial] of output.trials) {
      const trialPath = `artifacts/${id}/${id}.json`
      await fs.mkdir(path.dirname(path.join(directory, trialPath)), {recursive: true})
      await fs.writeFile(path.join(directory, trialPath), JSON.stringify(trial))
      trialPaths.set(id, trialPath)
    }
    const manifest = {
      id: output.id,
      scenarios: Object.fromEntries(output.scenarios),
      treatments: Object.fromEntries(output.treatments),
      trials: Object.fromEntries(trialPaths),
      ...(kind === 'benchmark' ? {capabilities: Object.fromEntries(benchmark.capabilities)} : {}),
    }
    const filepath = path.join(directory, 'output.json')
    await fs.writeFile(filepath, JSON.stringify(manifest))
    const before = await fs.readFile(path.join(directory, 'artifacts/trial-1/trial-1.json'), 'utf8')
    const read = kind === 'benchmark' ? readBenchmarkOutput : readExperimentOutput
    expect((await read(filepath)).output).toEqual(output)
    const bundle = await read(filepath)
    expect(bundle.output).toEqual(output)
    expect(await fs.readFile(path.join(directory, 'artifacts/trial-1/trial-1.json'), 'utf8')).toBe(before)
    if (bundle.output === null) {
      throw new Error('Expected an available bundle')
    }
    const details = await createExperimentRunDetails('2026-09-15', bundle.output, directory)
    expect(details.results[0].checks).toEqual([...output.trials.values()][0].checks)
  },
)

test.each([
  {key: 'benchmarkId', read: readBenchmarkOutput},
  {key: 'experimentId', read: readExperimentOutput},
])('marks legacy $key bundles unavailable with a migration message', async ({key, read}) => {
  const directory = await createDirectory()
  const filepath = path.join(directory, 'output.json')
  await fs.writeFile(filepath, JSON.stringify({[key]: 'legacy-run', trials: {}}))
  expect(await read(filepath)).toEqual({
    id: 'legacy-run',
    output: null,
    unavailableReason: expect.stringContaining('Regenerate the run'),
  })
})

test('does not disguise malformed current bundles as legacy or empty results', async () => {
  const directory = await createDirectory()
  const filepath = path.join(directory, 'output.json')
  await fs.writeFile(filepath, JSON.stringify({id: 'current'}))
  await expect(readExperimentOutput(filepath)).rejects.toThrow()
  await fs.writeFile(filepath, '{')
  await expect(readExperimentOutput(filepath)).rejects.toThrow(SyntaxError)
})

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
