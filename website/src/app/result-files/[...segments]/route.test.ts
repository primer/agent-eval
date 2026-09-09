import {afterEach, beforeEach, expect, test, vi} from 'vitest'
import {generateStaticParams, GET} from './route'

const {listBenchmarks, listBenchmarkRuns, listRuns, readWorkspaceFiles} = vi.hoisted(() => ({
  listBenchmarks: vi.fn(),
  listBenchmarkRuns: vi.fn(),
  listRuns: vi.fn(),
  readWorkspaceFiles: vi.fn(),
}))

vi.mock('../../../benchmarks', () => ({list: listBenchmarks}))
vi.mock('../../../benchmark-results', () => ({listBenchmarkRuns}))
vi.mock('../../../runs', () => ({list: listRuns}))
vi.mock('../../../workspace-files', () => ({readWorkspaceFiles}))

beforeEach(() => {
  vi.resetAllMocks()
  listBenchmarks.mockResolvedValue([])
  listRuns.mockResolvedValue([])
  readWorkspaceFiles.mockResolvedValue({files: [], truncated: false})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function request(segments: Array<string>) {
  return GET(new Request('https://example.com/result-files'), {params: Promise.resolve({segments})})
}

test('exports a file bundle for every experiment and benchmark trial', async () => {
  listRuns.mockResolvedValue([
    {
      name: '2026-09-09',
      output: {
        experiment: {id: 'experiment'},
        results: [
          {id: 'first', artifacts: {workspaceDirectory: 'artifacts/first/workspace'}},
          {id: 'second', artifacts: {workspaceDirectory: 'artifacts/second/workspace'}},
        ],
      },
    },
  ])
  listBenchmarks.mockResolvedValue([{id: 'benchmark'}])
  listBenchmarkRuns.mockResolvedValue([
    {
      name: '2026-09-08',
      output: {
        trials: new Map([['third', {id: 'third', artifacts: {workspaceDirectory: 'artifacts/third/workspace'}}]]),
      },
    },
  ])

  expect(await generateStaticParams()).toEqual([
    {segments: ['experiments', 'experiment', '2026-09-09', 'first', 'files.json']},
    {segments: ['experiments', 'experiment', '2026-09-09', 'second', 'files.json']},
    {segments: ['benchmarks', 'benchmark', '2026-09-08', 'third', 'files.json']},
  ])
  expect(listBenchmarkRuns).toHaveBeenCalledWith('benchmark')
})

test('supports a static export without result bundles', async () => {
  expect(await generateStaticParams()).toEqual([{segments: ['__no-runs__', 'files.json']}])
  expect(await (await request(['__no-runs__', 'files.json'])).json()).toEqual({files: [], truncated: false})
  expect(readWorkspaceFiles).not.toHaveBeenCalled()
})

test('reads the selected experiment trial workspace rather than other trial artifacts', async () => {
  listRuns.mockResolvedValue([
    {
      name: '2026-09-09',
      directory: '/results/experiments/experiment/2026-09-09',
      output: {
        experiment: {id: 'experiment'},
        results: [
          {id: 'first', artifacts: {workspaceDirectory: 'artifacts/first/workspace'}},
          {id: 'second', artifacts: {workspaceDirectory: 'artifacts/second/workspace'}},
        ],
      },
    },
  ])
  const files = {files: [{path: 'page.tsx', content: '<h1>Hello</h1>'}], truncated: false}
  readWorkspaceFiles.mockResolvedValue(files)

  const response = await request(['experiments', 'experiment', '2026-09-09', 'second', 'files.json'])
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(files)
  expect(readWorkspaceFiles).toHaveBeenCalledWith(
    'artifacts/second/workspace',
    '/results/experiments/experiment/2026-09-09',
  )
})

test('reads the selected benchmark trial workspace', async () => {
  listBenchmarks.mockResolvedValue([{id: 'benchmark'}])
  listBenchmarkRuns.mockResolvedValue([
    {
      name: '2026-09-09',
      directory: '/results/benchmarks/benchmark/2026-09-09',
      output: {
        trials: new Map([['trial', {id: 'trial', artifacts: {workspaceDirectory: 'artifacts/trial/workspace'}}]]),
      },
    },
  ])

  const response = await request(['benchmarks', 'benchmark', '2026-09-09', 'trial', 'files.json'])
  expect(response.status).toBe(200)
  expect(readWorkspaceFiles).toHaveBeenCalledWith(
    'artifacts/trial/workspace',
    '/results/benchmarks/benchmark/2026-09-09',
  )
})

test('returns not found for unknown trials and collections without reading files', async () => {
  for (const collection of ['experiments', 'benchmarks', 'unknown']) {
    const response = await request([collection, 'resource', '2026-09-09', 'missing', 'files.json'])
    expect(response.status).toBe(404)
  }
  expect(readWorkspaceFiles).not.toHaveBeenCalled()
})

test('reuses workspace metadata across static exports instead of rereading trial histories', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  listBenchmarks.mockResolvedValue([{id: 'benchmark'}])
  listBenchmarkRuns.mockResolvedValue([
    {
      name: '2026-09-09',
      directory: '/results/benchmarks/benchmark/2026-09-09',
      output: {
        trials: new Map(
          ['first', 'second'].map(id => [id, {id, artifacts: {workspaceDirectory: `artifacts/${id}/workspace`}}]),
        ),
      },
    },
  ])

  for (const {segments} of await generateStaticParams()) {
    expect((await request(segments)).status).toBe(200)
  }
  expect(listRuns).toHaveBeenCalledTimes(1)
  expect(listBenchmarkRuns).toHaveBeenCalledTimes(1)
  expect(readWorkspaceFiles).toHaveBeenCalledTimes(2)
})
