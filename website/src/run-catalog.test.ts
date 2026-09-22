import {beforeEach, expect, test, vi} from 'vitest'
import {list as listBenchmarks} from './benchmarks'
import {listBenchmarkRuns} from './benchmark-results'
import {list as listExperimentRuns} from './runs'
import {getRun, listRuns} from './run-catalog'
import {getRunHref, getRunId} from './run-url'
import {createBenchmarkOutput, createExperimentOutput} from './test-fixtures'

vi.mock('./benchmarks', () => ({list: vi.fn()}))
vi.mock('./benchmark-results', () => ({listBenchmarkRuns: vi.fn()}))
vi.mock('./runs', () => ({list: vi.fn()}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listBenchmarks).mockResolvedValue([
    {id: 'example', name: 'Example', description: '', models: [], capabilities: []},
  ])
  vi.mocked(listBenchmarkRuns).mockResolvedValue([])
  vi.mocked(listExperimentRuns).mockResolvedValue([])
})

test('lists benchmark and experiment runs newest first with distinct IDs for the same date and resource', async () => {
  const run = {
    id: '2026-09-20',
    name: '2026-09-20',
    date: new Date('2026-09-20'),
    directory: '/results/example/2026-09-20',
  }
  vi.mocked(listBenchmarkRuns).mockResolvedValue([{...run, output: {...createBenchmarkOutput([]), id: 'example'}}])
  vi.mocked(listExperimentRuns).mockResolvedValue([
    {...run, experimentId: 'example', output: {...createExperimentOutput([]), id: 'example'}},
    {
      ...run,
      id: '2026-09-21',
      name: '2026-09-21',
      date: new Date('2026-09-21'),
      experimentId: 'example',
      output: {...createExperimentOutput([]), id: 'example'},
    },
  ])

  const runs = await listRuns()
  expect(runs.map(({id}) => id)).toEqual([
    'experiments-example-2026-09-21',
    'benchmarks-example-2026-09-20',
    'experiments-example-2026-09-20',
  ])
  expect(listBenchmarkRuns).toHaveBeenCalledWith('example')
  for (const run of runs) {
    expect(await getRun(run.id)).toEqual(run)
  }
})

test('returns an empty list and no match when there are no runs', async () => {
  expect(await listRuns()).toEqual([])
  expect(await getRun('unknown')).toBeNull()
})

test('does not turn a requested run ID into a filesystem path', async () => {
  expect(await getRun('../../outside')).toBeNull()
  expect(listBenchmarkRuns).toHaveBeenCalledWith('example')
  expect(listExperimentRuns).toHaveBeenCalledWith()
})

test('run links encode resource IDs as one path segment and distinguish resources and dates', () => {
  const resourceId = 'space / literal%20 # café'
  const id = getRunId('experiments', resourceId, '2026-09-20')
  const href = getRunHref('experiments', resourceId, '2026-09-20')
  expect(href.split('/')).toHaveLength(3)
  expect(decodeURIComponent(href.slice('/runs/'.length))).toBe(id)
  expect(getRunId('experiments', 'other', '2026-09-20')).not.toBe(id)
  expect(getRunId('experiments', resourceId, '2026-09-21')).not.toBe(id)
})
