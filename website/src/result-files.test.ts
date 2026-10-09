import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type {BenchmarkOutput, ExperimentOutput} from '@primer/agent-eval'
import {afterEach, expect, onTestFinished, test, vi} from 'vitest'
import {readBenchmarkOutput, readExperimentOutput} from './result-files'
import {createBenchmarkOutput, createExperimentOutput, createTrial} from './test-fixtures'
import {createExperimentRunDetails, getWalkthroughAssets} from './run-details'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

async function createDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'website-results-'))
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

test('getBenchmarkRun reads only the requested date, not broken historical bundles', async () => {
  const directory = await createDirectory()
  const output = createBenchmarkOutput()
  const results = path.join(directory, 'results/benchmarks', output.id)
  await writeBundle(path.join(results, '2026-09-15'), output)
  const broken = await writeBundle(path.join(results, '2026-09-14'), output)
  await fs.rm(path.join(path.dirname(broken), 'artifacts'), {recursive: true})
  vi.spyOn(process, 'cwd').mockReturnValue(path.join(directory, 'website'))
  vi.resetModules()
  const {getBenchmarkRun} = await import('./benchmark-results')

  expect(await getBenchmarkRun(output.id, '2026-09-15')).toMatchObject({name: '2026-09-15', output})
  expect(await getBenchmarkRun(output.id, '2026-09-16')).toBeNull()
  expect(await getBenchmarkRun(output.id, '2026-02-30')).toBeNull()
  await expect(getBenchmarkRun(output.id, '2026-09-14')).rejects.toThrow('ENOENT')
})

test.each(['benchmark', 'experiment'] as const)(
  'reuses concurrent and repeated production %s bundle reads',
  async kind => {
    const directory = await createDirectory()
    const output = kind === 'benchmark' ? createBenchmarkOutput() : createExperimentOutput()
    const filepath = await writeBundle(directory, output)
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
    const readers = await import('./result-files')
    const read = kind === 'benchmark' ? readers.readBenchmarkOutput : readers.readExperimentOutput
    const readFile = vi.spyOn(fs, 'readFile')

    expect(await Promise.all([read(filepath), read(filepath), read(filepath)])).toEqual([output, output, output])
    expect(await read(filepath)).toEqual(output)
    expect(readFile).toHaveBeenCalledTimes(2)
  },
)

test.each(['benchmark', 'experiment'] as const)(
  'bounds the production %s bundle cache and keeps recently used runs',
  async kind => {
    const directory = await createDirectory()
    const output = kind === 'benchmark' ? createBenchmarkOutput() : createExperimentOutput()
    const first = await writeBundle(path.join(directory, 'first'), output)
    const second = await writeBundle(path.join(directory, 'second'), output)
    const third = await writeBundle(path.join(directory, 'third'), output)
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
    const readers = await import('./result-files')
    const read = kind === 'benchmark' ? readers.readBenchmarkOutput : readers.readExperimentOutput
    await read(first)
    await read(second)
    await read(first)
    await read(third)
    const readFile = vi.spyOn(fs, 'readFile')

    expect(await read(first)).toEqual(output)
    expect(readFile).not.toHaveBeenCalled()
    expect(await read(second)).toEqual(output)
    expect(readFile).toHaveBeenCalledTimes(2)
  },
)

test.each(['benchmark', 'experiment'] as const)(
  'retries failed and incompatible production %s bundle reads',
  async kind => {
    const directory = await createDirectory()
    const output = kind === 'benchmark' ? createBenchmarkOutput() : createExperimentOutput()
    const filepath = path.join(directory, 'output.json')
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
    const readers = await import('./result-files')
    const read = kind === 'benchmark' ? readers.readBenchmarkOutput : readers.readExperimentOutput
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(read(filepath)).rejects.toThrow('ENOENT')
    await fs.writeFile(filepath, '{}')
    expect(await read(filepath)).toBeNull()
    await writeBundle(directory, output)
    expect(await read(filepath)).toEqual(output)
  },
)

test.each(['benchmark', 'experiment'] as const)('rereads changed %s bundles outside production', async kind => {
  const directory = await createDirectory()
  const output = kind === 'benchmark' ? createBenchmarkOutput() : createExperimentOutput()
  const filepath = await writeBundle(directory, output)
  vi.stubEnv('NODE_ENV', 'development')
  vi.resetModules()
  const readers = await import('./result-files')
  const read = kind === 'benchmark' ? readers.readBenchmarkOutput : readers.readExperimentOutput
  expect(await read(filepath)).toEqual(output)
  output.trials.clear()
  await writeBundle(directory, output)

  expect(await read(filepath)).toEqual(output)
})

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
    const details = await createExperimentRunDetails('2026-09-15', bundle)
    expect(details.results[0].counts.checks).toEqual([...output.trials.values()][0].checks.length)
  },
)

test('reads benchmark-backed experiment capability metadata without losing trial membership', async () => {
  const directory = await createDirectory()
  const output = createBenchmarkOutput([
    {...createTrial(), capabilityId: 'a'},
    {...createTrial({id: 'trial-2', runner: 'copilot-sdk'}), capabilityId: 'b'},
  ])
  output.id = 'test-experiment'
  const filepath = await writeBundle(directory, output)

  const parsed = await readExperimentOutput(filepath)

  expect(parsed).toEqual(output)
  if (!parsed) {
    throw new Error('Expected an experiment bundle')
  }
  const details = await createExperimentRunDetails('2026-09-15', parsed)
  expect(
    details.results.map(result => {
      return result.capability
    }),
  ).toEqual([
    {id: 'a', name: 'First capability'},
    {id: 'b', name: 'Overlapping capability'},
  ])
})

test('reads a legacy experiment manifest without inventing capability membership', async () => {
  const directory = await createDirectory()
  const output = createExperimentOutput()
  const filepath = await writeBundle(directory, output)
  const manifest = JSON.parse(await fs.readFile(filepath, 'utf8'))
  delete manifest.capabilities
  await fs.writeFile(filepath, JSON.stringify(manifest))

  expect(await readExperimentOutput(filepath)).toEqual(output)
})

test('rejects experiment trial capability membership that conflicts with the manifest', async () => {
  const directory = await createDirectory()
  const output = createBenchmarkOutput([{...createTrial(), capabilityId: 'unknown'}])
  const filepath = await writeBundle(directory, output)

  await expect(readExperimentOutput(filepath)).rejects.toThrow('Invalid capability "unknown"')
})

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

test.each(['benchmark', 'experiment'] as const)(
  'defaults a legacy %s trial runner when reading the bundle',
  async kind => {
    const directory = await createDirectory()
    const output = kind === 'benchmark' ? createBenchmarkOutput() : createExperimentOutput()
    const filepath = await writeBundle(directory, output)
    const trialPath = path.join(directory, 'artifacts/trial-1/trial-1.json')
    const legacy: Record<string, unknown> = {...output.trials.get('trial-1')}
    delete legacy.runner
    const contents = JSON.stringify(legacy)
    await fs.writeFile(trialPath, contents)
    const read = kind === 'benchmark' ? readBenchmarkOutput : readExperimentOutput

    const parsed = await read(filepath)

    expect(parsed).toEqual(output)
    expect(await fs.readFile(trialPath, 'utf8')).toBe(contents)
  },
)

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

test('references screenshot and video files relative to a relocated run without embedding their contents', async () => {
  const directory = await createDirectory()
  const media = 'artifacts/trial-1/walkthrough/image.jpg'
  await fs.mkdir(path.dirname(path.join(directory, media)), {recursive: true})
  await fs.writeFile(path.join(directory, media), 'image')
  const baseUrl = '/run-data/benchmarks/example/2026-09-15/trial-1'
  const assets = await getWalkthroughAssets({type: 'Screenshot', filepath: media}, directory, baseUrl)
  expect(assets.walkthrough).toEqual({
    type: 'Screenshot',
    screenshot: `${baseUrl}/media-0.jpg`,
  })
  expect(assets.media).toEqual([{name: 'media-0.jpg', filepath: path.join(directory, media), mimeType: 'image/jpeg'}])
  const artifacts = '/another-machine/results/artifacts/trial-1/walkthrough'
  expect(
    (await getWalkthroughAssets({type: 'Screenshot', filepath: 'walkthrough/image.jpg'}, directory, baseUrl, artifacts))
      .walkthrough,
  ).toEqual({
    type: 'Screenshot',
    screenshot: `${baseUrl}/media-0.jpg`,
  })
  expect(
    (await getWalkthroughAssets({type: 'Screenshots', screenshots: [media]}, directory, baseUrl)).walkthrough,
  ).toEqual({
    type: 'Screenshots',
    screenshots: [`${baseUrl}/media-0.jpg`],
  })
  const video = 'artifacts/trial-1/walkthrough/video.webm'
  await fs.writeFile(path.join(directory, video), 'video')
  expect((await getWalkthroughAssets({type: 'Video', filepath: video}, directory, baseUrl)).walkthrough).toEqual({
    type: 'Video',
    video: `${baseUrl}/media-0.webm`,
  })
  expect(
    (
      await getWalkthroughAssets(
        {type: 'Screenshots', screenshots: ['walkthrough/image.jpg']},
        directory,
        baseUrl,
        artifacts,
      )
    ).walkthrough,
  ).toEqual({
    type: 'Screenshots',
    screenshots: [`${baseUrl}/media-0.jpg`],
  })
  expect(
    (await getWalkthroughAssets({type: 'Video', filepath: 'walkthrough/video.webm'}, directory, baseUrl, artifacts))
      .walkthrough,
  ).toEqual({
    type: 'Video',
    video: `${baseUrl}/media-0.webm`,
  })
  expect(await getWalkthroughAssets({type: 'Screenshot', filepath: 'missing.png'}, directory, baseUrl)).toEqual({
    walkthrough: {type: 'Unavailable'},
    media: [],
  })
})

test.each([
  ['Screenshot', 'file'],
  ['Screenshot', 'parent'],
  ['Screenshot', 'artifacts'],
  ['Video', 'file'],
  ['Video', 'parent'],
  ['Video', 'artifacts'],
] as const)('rejects %s media escaping through a %s symlink', async (type, symlinkKind) => {
  const directory = await createDirectory()
  const runDirectory = path.join(directory, 'run')
  const outsideDirectory = path.join(directory, 'artifacts-outside')
  const filename = type === 'Video' ? 'media.webm' : 'media.png'
  const relativePath = `artifacts/trial-1/walkthrough/${filename}`
  const outsideFile = path.join(outsideDirectory, 'trial-1/walkthrough', filename)
  await fs.mkdir(path.dirname(outsideFile), {recursive: true})
  await fs.writeFile(outsideFile, 'outside media')

  if (symlinkKind === 'artifacts') {
    await fs.mkdir(runDirectory)
    await fs.symlink(outsideDirectory, path.join(runDirectory, 'artifacts'))
  } else if (symlinkKind === 'parent') {
    await fs.mkdir(path.join(runDirectory, 'artifacts/trial-1'), {recursive: true})
    await fs.symlink(path.dirname(outsideFile), path.join(runDirectory, 'artifacts/trial-1/walkthrough'))
  } else {
    await fs.mkdir(path.dirname(path.join(runDirectory, relativePath)), {recursive: true})
    await fs.symlink(outsideFile, path.join(runDirectory, relativePath))
  }

  await expect(getWalkthroughAssets({type, filepath: relativePath}, runDirectory, '/run-data/example')).rejects.toThrow(
    'outside its artifacts directory',
  )
})

test.each(['file', 'parent', 'run'] as const)(
  'allows a contained %s symlink and returns canonical media paths',
  async kind => {
    const directory = await createDirectory()
    let runDirectory = path.join(directory, 'run')
    const mediaDirectory = path.join(runDirectory, 'artifacts/trial-1/walkthrough')
    const filepath = path.join(mediaDirectory, 'image.png')
    await fs.mkdir(mediaDirectory, {recursive: true})
    await fs.writeFile(filepath, 'image')
    let media = 'artifacts/trial-1/walkthrough/image.png'
    if (kind === 'file') {
      await fs.symlink(filepath, path.join(mediaDirectory, 'linked.png'))
      media = 'artifacts/trial-1/walkthrough/linked.png'
    } else if (kind === 'parent') {
      await fs.symlink(mediaDirectory, path.join(runDirectory, 'artifacts/linked'))
      media = 'artifacts/linked/image.png'
    } else {
      const alias = path.join(directory, 'run-alias')
      await fs.symlink(runDirectory, alias)
      runDirectory = alias
    }

    const assets = await getWalkthroughAssets({type: 'Screenshot', filepath: media}, runDirectory, '/run-data/example')

    expect(assets.media).toEqual([{name: 'media-0.png', filepath: await fs.realpath(filepath), mimeType: 'image/png'}])
  },
)

test.each([false, true])('enforces legacy artifacts containment (escaping: %s)', async escaping => {
  const directory = await createDirectory()
  const sampleFile = path.join(directory, 'sample.png')
  await fs.writeFile(sampleFile, 'image')
  const stats = await fs.stat(sampleFile)
  const legacyDirectory = path.resolve(process.cwd(), '..', 'artifacts')
  const candidate = path.join(legacyDirectory, 'trial-1/walkthrough/image.png')
  const resolved = escaping ? `${legacyDirectory}-outside/image.png` : candidate
  vi.spyOn(fs, 'realpath').mockResolvedValueOnce(path.dirname(legacyDirectory)).mockResolvedValueOnce(resolved)
  const stat = vi.spyOn(fs, 'stat').mockResolvedValue(stats)

  const assets = getWalkthroughAssets({type: 'Screenshot', filepath: candidate}, directory, '/run-data/example')
  if (escaping) {
    await expect(assets).rejects.toThrow('outside its artifacts directory')
    expect(stat).not.toHaveBeenCalled()
  } else {
    expect((await assets).media).toEqual([{name: 'media-0.png', filepath: candidate, mimeType: 'image/png'}])
  }
})
