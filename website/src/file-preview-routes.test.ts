import {afterEach, beforeEach, expect, test, vi} from 'vitest'
import {getFilePreviewKey} from './file-preview-key'
import {generateFilePreviewParams, getFilePreview, type FilePreviewParams} from './file-preview-routes'
import {
  dynamic,
  dynamicParams,
  generateStaticParams,
  GET,
} from './app/file-previews/[collection]/[id]/[date]/[trial]/[file]/preview.json/route'
import type {WorkspaceFile, WorkspaceFiles} from './workspace-files'

const mocks = vi.hoisted(() => {
  return {
    listBenchmarks: vi.fn(),
    listBenchmarkRuns: vi.fn(),
    getBenchmarkRun: vi.fn(),
    listExperimentRuns: vi.fn(),
    getExperimentRun: vi.fn(),
    getWorkspaceFiles: vi.fn(),
    highlightFile: vi.fn(),
  }
})

vi.mock('server-only', () => {
  return {}
})
vi.mock('./benchmarks', () => {
  return {list: mocks.listBenchmarks}
})
vi.mock('./benchmark-results', () => {
  return {listBenchmarkRuns: mocks.listBenchmarkRuns, getBenchmarkRun: mocks.getBenchmarkRun}
})
vi.mock('./runs', () => {
  return {list: mocks.listExperimentRuns, get: mocks.getExperimentRun}
})
vi.mock('./workspace-files', () => {
  return {getWorkspaceFiles: mocks.getWorkspaceFiles}
})
vi.mock('./file-highlighting', () => {
  return {highlightFile: mocks.highlightFile}
})

const nestedFile: WorkspaceFile = {
  type: 'file',
  name: 'index.ts',
  path: 'src/components/index.ts',
  size: 10,
  preview: {type: 'text', content: 'export {}\n'},
}
const otherFile: WorkspaceFile = {
  ...nestedFile,
  name: 'README.md',
  path: 'README.md',
}
const workspace: WorkspaceFiles = {
  type: 'available',
  truncated: false,
  entries: [
    {
      type: 'directory',
      name: 'src',
      path: 'src',
      children: [{type: 'directory', name: 'components', path: 'src/components', children: [nestedFile]}],
    },
    otherFile,
    {...otherFile, name: 'empty.txt', path: 'empty.txt', size: 0, preview: {type: 'text', content: ''}},
    {
      ...otherFile,
      name: 'link',
      path: 'link',
      preview: {type: 'unavailable', reason: 'Symbolic links and special files are not previewed.'},
    },
  ],
}
const benchmarkRun = {
  name: '2026-09-03',
  directory: '/saved/benchmarks/example/2026-09-03',
  output: {
    trials: new Map([
      ['not-the-trial-id', {id: 'trial 1', artifacts: {workspaceDirectory: 'artifacts/benchmark-workspace'}}],
      ['second', {id: 'trial 2', artifacts: {workspaceDirectory: 'artifacts/unavailable'}}],
    ]),
  },
}
const experimentRun = {
  name: '2026-09-03',
  directory: '/saved/experiments/example/2026-09-03',
  output: {
    id: 'example',
    trials: new Map([
      ['trial 1', {id: 'trial 1', artifacts: {workspaceDirectory: 'artifacts/experiment-workspace'}}],
      ['trial 2', {id: 'trial 2', artifacts: {workspaceDirectory: undefined}}],
    ]),
  },
}

function params(collection = 'benchmarks'): FilePreviewParams {
  return {collection, id: 'example', date: '2026-09-03', trial: 'trial 1', file: getFilePreviewKey(nestedFile.path)}
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.resetModules()
  mocks.listBenchmarks.mockResolvedValue([{id: 'example'}])
  mocks.listBenchmarkRuns.mockResolvedValue([benchmarkRun])
  mocks.getBenchmarkRun.mockResolvedValue(benchmarkRun)
  mocks.listExperimentRuns.mockResolvedValue([experimentRun])
  mocks.getExperimentRun.mockResolvedValue(experimentRun)
  mocks.getWorkspaceFiles.mockImplementation(async (directory: string | undefined) => {
    if (!directory || directory === 'artifacts/unavailable') {
      return {type: 'unavailable', reason: 'No workspace available.'}
    }
    return workspace
  })
  mocks.highlightFile.mockResolvedValue({type: 'highlighted', content: 'export {}\n', tokens: []})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

test('enumerates both collections and nested files without highlighting or overlapping workspace reads', async () => {
  let activeReads = 0
  let maximumReads = 0
  const readWorkspace = mocks.getWorkspaceFiles.getMockImplementation()!
  mocks.getWorkspaceFiles.mockImplementation(async (...args) => {
    activeReads++
    maximumReads = Math.max(maximumReads, activeReads)
    const result = await readWorkspace(...args)
    activeReads--
    return result
  })

  expect(await generateFilePreviewParams()).toEqual([
    params('benchmarks'),
    {...params('benchmarks'), file: getFilePreviewKey(otherFile.path)},
    params('experiments'),
    {...params('experiments'), file: getFilePreviewKey(otherFile.path)},
  ])
  expect(maximumReads).toBe(1)
  expect(mocks.getWorkspaceFiles).toHaveBeenCalledTimes(4)
  expect(mocks.highlightFile).not.toHaveBeenCalled()
})

test.each(['benchmarks', 'experiments'])('highlights only the requested %s file', async collection => {
  const response = await GET(new Request('https://example.test/'), {params: Promise.resolve(params(collection))})

  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('application/json')
  expect(await response.json()).toEqual({type: 'highlighted', content: 'export {}\n', tokens: []})
  expect(mocks.highlightFile).toHaveBeenCalledExactlyOnceWith(nestedFile)
  expect(mocks.getWorkspaceFiles).toHaveBeenCalledExactlyOnceWith(
    `artifacts/${collection === 'benchmarks' ? 'benchmark' : 'experiment'}-workspace`,
    `/saved/${collection}/example/2026-09-03`,
  )
  expect(mocks.listExperimentRuns).not.toHaveBeenCalled()
  expect(mocks.listBenchmarkRuns).not.toHaveBeenCalled()
})

test.each(['benchmarks', 'experiments'])('returns 404 for a missing %s trial', async collection => {
  expect(await getFilePreview({...params(collection), trial: 'missing'})).toBeNull()
  expect(mocks.getWorkspaceFiles).not.toHaveBeenCalled()
  expect(mocks.highlightFile).not.toHaveBeenCalled()
})

test.each(['missing.ts', 'empty.txt', 'link'])('returns explicit 404 JSON for %s', async filepath => {
  const response = await GET(new Request('https://example.test/'), {
    params: Promise.resolve({...params(), file: getFilePreviewKey(filepath)}),
  })
  expect(response.status).toBe(404)
  expect(await response.json()).toEqual({error: 'File preview not found.'})
  expect(mocks.highlightFile).not.toHaveBeenCalled()
})

test.each(['benchmarks', 'experiments'])('excludes unavailable %s workspaces', async collection => {
  expect(await getFilePreview({...params(collection), trial: 'trial 2'})).toBeNull()
  expect(mocks.highlightFile).not.toHaveBeenCalled()
})

test('returns 404 for missing benchmark IDs or dates', async () => {
  mocks.getBenchmarkRun.mockResolvedValue(null)
  expect(await getFilePreview({...params(), id: 'missing'})).toBeNull()
  expect(await getFilePreview({...params(), date: '2026-09-04'})).toBeNull()
  expect(mocks.getWorkspaceFiles).not.toHaveBeenCalled()
})

test('returns 404 for missing experiment IDs or dates', async () => {
  mocks.getExperimentRun.mockImplementation(async (id: string, date: string) => {
    throw new Error(`Run "${date}" for experiment "${id}" was not found in: /saved/experiments`)
  })
  expect(await getFilePreview({...params('experiments'), id: 'missing'})).toBeNull()
  expect(await getFilePreview({...params('experiments'), date: '2026-09-04'})).toBeNull()
  expect(mocks.getWorkspaceFiles).not.toHaveBeenCalled()
})

test.each([
  {collection: 'unknown'},
  {id: '../example'},
  {id: '..'},
  {id: 'example\\other'},
  {id: '%2e%2e'},
  {id: '\0'},
  {trial: '../trial'},
  {trial: ''},
  {date: '2026-02-30'},
  {date: '../2026-09-03'},
  {file: 'src/index.ts'},
  {file: 'a'.repeat(63)},
])('rejects invalid route parameters before loading results: %j', async invalid => {
  expect(await getFilePreview({...params(), ...invalid})).toBeNull()
  expect(mocks.getBenchmarkRun).not.toHaveBeenCalled()
  expect(mocks.getExperimentRun).not.toHaveBeenCalled()
  expect(mocks.getWorkspaceFiles).not.toHaveBeenCalled()
})

test('uses a 404 sentinel when no previewable files exist', async () => {
  mocks.getWorkspaceFiles.mockResolvedValue({type: 'available', entries: [], truncated: false})
  const generated = await generateStaticParams()
  expect(dynamic).toBe('force-static')
  expect(dynamicParams).toBe(false)
  expect(generated).toEqual([
    {collection: 'benchmarks', id: '__no-runs__', date: '__no-runs__', trial: '__no-runs__', file: '__no-runs__'},
  ])
  const response = await GET(new Request('https://example.test/'), {params: Promise.resolve(generated[0])})
  expect(response.status).toBe(404)
  expect(await response.json()).toEqual({error: 'File preview not found.'})
  expect(mocks.getBenchmarkRun).not.toHaveBeenCalled()
})

test('uses the sentinel when there are no saved runs', async () => {
  mocks.listBenchmarkRuns.mockResolvedValue([])
  mocks.listExperimentRuns.mockResolvedValue([])
  expect(await generateFilePreviewParams()).toEqual([
    {collection: 'benchmarks', id: '__no-runs__', date: '__no-runs__', trial: '__no-runs__', file: '__no-runs__'},
  ])
  expect(mocks.getWorkspaceFiles).not.toHaveBeenCalled()
})

test('does not cache development previews across calls', async () => {
  vi.stubEnv('NODE_ENV', 'development')
  await getFilePreview(params())
  mocks.getWorkspaceFiles.mockResolvedValue({type: 'unavailable', reason: 'Workspace removed.'})
  expect(await getFilePreview(params())).toBeNull()
  expect(mocks.getBenchmarkRun).toHaveBeenCalledTimes(2)
  expect(mocks.highlightFile).toHaveBeenCalledTimes(1)
})

test('indexes a 2,000-file workspace once when generating production previews', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  const routes = await import('./file-preview-routes')
  const entries = Array.from({length: 2000}, (_, index) => {
    return {...otherFile, path: `file-${index}.ts`, name: `file-${index}.ts`}
  })
  mocks.getWorkspaceFiles.mockResolvedValue({type: 'available', entries, truncated: false})
  mocks.listBenchmarkRuns.mockResolvedValue([
    {...benchmarkRun, output: {trials: new Map([['trial 1', benchmarkRun.output.trials.get('not-the-trial-id')]])}},
  ])
  mocks.listExperimentRuns.mockResolvedValue([])

  const generated = await routes.generateFilePreviewParams()
  expect(generated).toHaveLength(2000)
  for (const location of generated) {
    expect(await routes.getFilePreview(location)).not.toBeNull()
  }
  expect(mocks.getWorkspaceFiles).toHaveBeenCalledTimes(1)
  expect(mocks.highlightFile).toHaveBeenCalledTimes(2000)
  expect(mocks.highlightFile).toHaveBeenLastCalledWith(entries[1999])
  expect(await routes.getFilePreview({...params(), file: getFilePreviewKey('not-indexed.ts')})).toBeNull()
  expect(mocks.getWorkspaceFiles).toHaveBeenCalledTimes(1)
})

test('shares in-flight production workspace reads across preview requests', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  const routes = await import('./file-preview-routes')
  const pending = Promise.withResolvers<WorkspaceFiles>()
  mocks.getWorkspaceFiles.mockReturnValueOnce(pending.promise)
  const requests = Promise.all([
    routes.getFilePreview(params()),
    routes.getFilePreview({...params(), file: getFilePreviewKey('missing.ts')}),
  ])
  await vi.waitFor(() => {
    expect(mocks.getBenchmarkRun).toHaveBeenCalledTimes(2)
    expect(mocks.getWorkspaceFiles).toHaveBeenCalledTimes(1)
  })
  expect(mocks.highlightFile).not.toHaveBeenCalled()
  pending.resolve(workspace)
  expect(await requests).toEqual([{type: 'highlighted', content: 'export {}\n', tokens: []}, null])
  expect(mocks.getWorkspaceFiles).toHaveBeenCalledTimes(1)
  expect(mocks.highlightFile).toHaveBeenCalledTimes(1)
})

test('bounds production indexes and keeps recently used workspaces', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  const routes = await import('./file-preview-routes')
  mocks.getBenchmarkRun.mockImplementation(async (id: string) => {
    return {...benchmarkRun, directory: `/saved/${id}`}
  })
  for (let index = 0; index < 8; index++) {
    await routes.getFilePreview({...params(), id: `run-${index}`})
  }
  await routes.getFilePreview({...params(), id: 'run-0'})
  expect(mocks.getWorkspaceFiles).toHaveBeenCalledTimes(8)
  await routes.getFilePreview({...params(), id: 'run-8'})
  await routes.getFilePreview({...params(), id: 'run-0'})
  expect(mocks.getWorkspaceFiles).toHaveBeenCalledTimes(9)
  await routes.getFilePreview({...params(), id: 'run-1'})
  expect(mocks.getWorkspaceFiles).toHaveBeenCalledTimes(10)
})

test('isolates production indexes by workspace within each run', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  const routes = await import('./file-preview-routes')
  await routes.getFilePreview(params())
  expect(await routes.getFilePreview({...params(), trial: 'trial 2'})).toBeNull()
  expect(mocks.getWorkspaceFiles).toHaveBeenCalledTimes(2)
  expect(mocks.highlightFile).toHaveBeenCalledTimes(1)
})

test('retries failed production index reads instead of caching errors', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  const routes = await import('./file-preview-routes')
  mocks.getWorkspaceFiles.mockRejectedValueOnce(new Error('Permission denied'))
  await expect(routes.getFilePreview(params())).rejects.toThrow('Permission denied')
  expect(await routes.getFilePreview(params())).not.toBeNull()
  expect(mocks.getWorkspaceFiles).toHaveBeenCalledTimes(2)
})

test('does not hide unexpected reader or highlighting failures', async () => {
  const failure = new Error('Invalid output JSON')
  mocks.getExperimentRun.mockRejectedValueOnce(failure)
  await expect(getFilePreview(params('experiments'))).rejects.toThrow(failure)
  mocks.highlightFile.mockRejectedValueOnce(new Error('Highlighting failed'))
  await expect(getFilePreview(params())).rejects.toThrow('Highlighting failed')
})

test('returns 404 when the saved result disappeared', async () => {
  mocks.getBenchmarkRun.mockRejectedValueOnce(Object.assign(new Error('Missing output'), {code: 'ENOENT'}))
  expect(await getFilePreview(params())).toBeNull()
})
