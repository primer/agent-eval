import fs from 'node:fs/promises'
import path from 'node:path'
import {afterEach, beforeEach, expect, onTestFinished, test, vi} from 'vitest'
import {getBenchmarkRun, listBenchmarkRuns} from './benchmark-results'
import {list as listBenchmarks} from './benchmarks'
import {get as getExperimentRun, list as listExperimentRuns} from './runs'
import {getRunAsset, listRunAssetParams} from './run-assets'
import {checks, createBenchmarkOutput, createExperimentOutput, createTrial, judges, session} from './test-fixtures'

vi.mock('./benchmark-results', () => {
  return {getBenchmarkRun: vi.fn(), listBenchmarkRuns: vi.fn()}
})
vi.mock('./benchmarks', () => {
  return {list: vi.fn()}
})
vi.mock('./runs', () => {
  return {get: vi.fn(), list: vi.fn()}
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listBenchmarks).mockResolvedValue([])
  vi.mocked(listExperimentRuns).mockResolvedValue([])
})

afterEach(() => {
  vi.unstubAllEnvs()
})

test.each(['benchmarks', 'experiments'] as const)(
  'exports separate JSON and exact media bytes for %s with base-path URLs',
  async collection => {
    const root = path.resolve('.agents/tmp')
    await fs.mkdir(root, {recursive: true})
    const directory = await fs.mkdtemp(path.join(root, 'run-assets-'))
    onTestFinished(async () => {
      await fs.rm(directory, {recursive: true, force: true})
    })
    const mediaDirectory = path.join(directory, 'artifacts/trial-1/walkthrough')
    await fs.mkdir(mediaDirectory, {recursive: true})
    const image = Buffer.from([0, 255, 1, 2, 3])
    const video = Buffer.from([255, 0, 3, 2, 1])
    await fs.writeFile(path.join(mediaDirectory, 'image.png'), image)
    await fs.writeFile(path.join(mediaDirectory, 'video.webm'), video)
    const trial = createTrial({
      walkthrough: {type: 'Screenshots', screenshots: ['walkthrough/missing.png', 'walkthrough/image.png']},
      agent: {
        sessions: [
          {
            ...session,
            messages: [
              {
                type: 'assistant.message_delta',
                id: 'message-1',
                parentId: '',
                ephemeral: true,
                timestamp: '2026-09-15T00:00:00.000Z',
                data: {messageId: 'message-1', deltaContent: 'TRANSCRIPT_ONLY_CONTENT'},
              },
            ],
          },
        ],
      },
    })
    const trials = [
      trial,
      createTrial({
        id: 'trial-2',
        walkthrough: {type: 'Video', filepath: 'walkthrough/video.webm'},
      }),
    ]
    const output = collection === 'benchmarks' ? createBenchmarkOutput(trials) : createExperimentOutput(trials)
    const run = {id: '2026-09-15', name: '2026-09-15', date: new Date('2026-09-15'), directory, output}
    if (collection === 'benchmarks') {
      const benchmarkRun = {...run, output: createBenchmarkOutput(trials)}
      vi.mocked(listBenchmarks).mockResolvedValue([
        {
          id: output.id,
          name: 'Benchmark',
          description: '',
          models: [],
          capabilities: [],
        },
      ])
      vi.mocked(listBenchmarkRuns).mockResolvedValue([benchmarkRun])
      vi.mocked(getBenchmarkRun).mockResolvedValue(benchmarkRun)
    } else {
      const experimentRun = {...run, experimentId: output.id}
      vi.mocked(listExperimentRuns).mockResolvedValue([experimentRun])
      vi.mocked(getExperimentRun).mockResolvedValue(experimentRun)
    }
    vi.stubEnv('PAGES_BASE_PATH', '/agent-eval')
    const segments = [collection, output.id, run.name, trial.id]
    const params = await listRunAssetParams()
    expect(params).toContainEqual({asset: [...segments, 'details.json']})
    expect(params).toContainEqual({asset: [...segments, 'transcript.json']})
    expect(params).toContainEqual({asset: [...segments, 'media-1.png']})
    expect(params).not.toContainEqual({asset: [...segments, 'media-0.png']})
    const details = await (await getRunAsset([...segments, 'details.json'])).json()
    expect(details).toMatchObject({
      id: trial.id,
      checks: trial.checks,
      walkthrough: {type: 'Screenshots', screenshots: [`/agent-eval/run-data/${segments.join('/')}/media-1.png`]},
    })
    expect(details).not.toHaveProperty('transcript')
    expect(JSON.stringify(details)).not.toContain('TRANSCRIPT_ONLY_CONTENT')
    expect(JSON.stringify(details)).not.toContain('base64')
    const transcript = await (await getRunAsset([...segments, 'transcript.json'])).json()
    expect(transcript).toMatchObject([{id: '0:message-1', content: 'TRANSCRIPT_ONLY_CONTENT'}])
    const screenshot = await getRunAsset([...segments, 'media-1.png'])
    expect(screenshot.headers.get('Content-Type')).toBe('image/png')
    expect(Buffer.from(await screenshot.arrayBuffer())).toEqual(image)
    const recording = await getRunAsset([collection, output.id, run.name, 'trial-2', 'media-0.webm'])
    expect(recording.headers.get('Content-Type')).toBe('video/webm')
    expect(Buffer.from(await recording.arrayBuffer())).toEqual(video)
    expect((await getRunAsset([...segments, 'not-declared.png'])).status).toBe(404)
    expect((await getRunAsset([collection, output.id, run.name, 'missing-trial', 'details.json'])).status).toBe(404)
    await fs.rm(path.join(mediaDirectory, 'image.png'))
    expect((await getRunAsset([...segments, 'media-1.png'])).status).toBe(404)
  },
)

test('handles empty run collections without inventing data', async () => {
  expect(await listRunAssetParams()).toEqual([{asset: ['__no-runs__']}])
  expect((await getRunAsset(['__no-runs__'])).status).toBe(404)
})

test.each(['benchmarks', 'experiments'] as const)(
  'rejects escaping media before reading host data for %s',
  async collection => {
    const root = path.resolve('.agents/tmp')
    await fs.mkdir(root, {recursive: true})
    const directory = await fs.mkdtemp(path.join(root, 'run-assets-symlink-'))
    onTestFinished(async () => {
      await fs.rm(directory, {recursive: true, force: true})
    })
    const runDirectory = path.join(directory, 'run')
    const mediaDirectory = path.join(runDirectory, 'artifacts/trial-1/walkthrough')
    await fs.mkdir(mediaDirectory, {recursive: true})
    const outsideFile = path.join(directory, 'private.txt')
    await fs.writeFile(outsideFile, 'HOST_DATA_MUST_NOT_BE_READ')
    await fs.symlink(outsideFile, path.join(mediaDirectory, 'image.png'))
    const trial = createTrial({walkthrough: {type: 'Screenshot', filepath: 'walkthrough/image.png'}})
    const output = collection === 'benchmarks' ? createBenchmarkOutput([trial]) : createExperimentOutput([trial])
    const run = {id: '2026-09-15', name: '2026-09-15', date: new Date('2026-09-15'), directory: runDirectory, output}
    if (collection === 'benchmarks') {
      const benchmarkRun = {...run, output: createBenchmarkOutput([trial])}
      vi.mocked(getBenchmarkRun).mockResolvedValue(benchmarkRun)
      vi.mocked(listBenchmarkRuns).mockResolvedValue([benchmarkRun])
      vi.mocked(listBenchmarks).mockResolvedValue([
        {id: output.id, name: 'Benchmark', description: '', models: [], capabilities: []},
      ])
    } else {
      const experimentRun = {...run, experimentId: output.id}
      vi.mocked(getExperimentRun).mockResolvedValue(experimentRun)
      vi.mocked(listExperimentRuns).mockResolvedValue([experimentRun])
    }
    const readFile = vi.spyOn(fs, 'readFile')
    onTestFinished(() => {
      readFile.mockRestore()
    })
    const segments = [collection, output.id, run.name, trial.id]

    await expect(getRunAsset([...segments, 'media-0.png'])).rejects.toThrow('outside its artifacts directory')
    await expect(getRunAsset([...segments, 'details.json'])).rejects.toThrow('outside its artifacts directory')
    await expect(listRunAssetParams()).rejects.toThrow('outside its artifacts directory')
    expect(readFile).not.toHaveBeenCalled()
  },
)

test.each(['benchmarks', 'experiments'] as const)(
  'exports only scenario-relative reference paths for %s without mutating stored results',
  async collection => {
    const trial = createTrial({
      checks: checks.map(check => {
        return {
          ...check,
          check: {
            ...check.check,
            files: [{filepath: '/private/runner/scenario/check.ts', relativePath: 'check.ts'}],
          },
        }
      }),
      judges: judges.map(judge => {
        return {
          ...judge,
          judge: {
            ...judge.judge,
            files: [
              {
                filepath: '/private/runner/scenario/references/expected.png',
                relativePath: 'references/expected.png',
              },
            ],
          },
        }
      }),
    })
    const before = structuredClone(trial)
    const run = {id: '2026-09-15', name: '2026-09-15', date: new Date('2026-09-15'), directory: '/results'}
    const output = collection === 'benchmarks' ? createBenchmarkOutput([trial]) : createExperimentOutput([trial])
    if (collection === 'benchmarks') {
      vi.mocked(getBenchmarkRun).mockResolvedValue({...run, output: createBenchmarkOutput([trial])})
    } else {
      vi.mocked(getExperimentRun).mockResolvedValue({...run, experimentId: output.id, output})
    }

    const response = await getRunAsset([collection, output.id, run.name, trial.id, 'details.json'])
    const details = await response.json()

    expect(response.status).toBe(200)
    expect(JSON.stringify(details)).not.toContain('/private/runner')
    expect(details.checks).toEqual(
      trial.checks.map(check => {
        return {
          ...check,
          check: {...check.check, files: [{filepath: 'check.ts', relativePath: 'check.ts'}]},
        }
      }),
    )
    expect(details.judges).toEqual(
      trial.judges.map(judge => {
        return {
          judge: {
            ...judge.judge,
            files: [{filepath: 'references/expected.png', relativePath: 'references/expected.png'}],
          },
          result: judge.result,
        }
      }),
    )
    expect(trial).toEqual(before)
  },
)

test.each([
  ['other', 'id', '2026-09-15', 'trial', 'details.json'],
  ['benchmarks', '..', '2026-09-15', 'trial', 'details.json'],
  ['benchmarks', '../outside', '2026-09-15', 'trial', 'details.json'],
  ['benchmarks', 'id', '2026-09-15', 'trial', '../outside'],
])('rejects unknown collections and unsafe asset segments: %j', async (...segments) => {
  expect((await getRunAsset(segments)).status).toBe(404)
  expect(getBenchmarkRun).not.toHaveBeenCalled()
  expect(getExperimentRun).not.toHaveBeenCalled()
})
