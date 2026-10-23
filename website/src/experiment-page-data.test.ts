import {beforeEach, expect, test, vi} from 'vitest'
import {getExperimentPageData, getExperimentsOverview} from './experiment-page-data'
import {get, list} from './experiments'
import {getLatestForExperiment, listForExperiment} from './runs'
import {createResult, createRun} from './test/experiment'
import {createErrorTrial} from './test-fixtures'

vi.mock('./experiments', () => {
  return {get: vi.fn(), list: vi.fn()}
})
vi.mock('./runs', () => {
  return {getLatestForExperiment: vi.fn(), listForExperiment: vi.fn()}
})

const experiment = {
  id: 'example',
  name: 'Example experiment',
  description: 'Compare treatments',
  models: [],
  scenarios: [],
  treatments: [],
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(get).mockResolvedValue(experiment)
  vi.mocked(list).mockResolvedValue([experiment])
})

test('uses the newest run from the dated run loader and preserves run history', async () => {
  vi.mocked(listForExperiment).mockResolvedValue([
    createRun([createResult()]),
    createRun([createResult(), createResult({id: 'second'})], '2026-09-09'),
  ])
  const data = await getExperimentPageData('example')
  expect(get).toHaveBeenCalledWith('example')
  expect(listForExperiment).toHaveBeenCalledWith('example')
  expect(data.results).toMatchObject({date: '2026-09-10', treatments: [{trials: 1}]})
  expect(data.runs).toEqual([
    {id: '2026-09-10', name: '2026-09-10', resultCount: 1, checks: '75.0%', status: 'complete', errorCount: 0},
    {id: '2026-09-09', name: '2026-09-09', resultCount: 2, checks: '75.0%', status: 'complete', errorCount: 0},
  ])
})

test('overview includes experiments without results and only sends summary data', async () => {
  vi.mocked(list).mockResolvedValue([experiment, {...experiment, id: 'empty'}])
  vi.mocked(getLatestForExperiment).mockImplementation(async id => {
    return id === 'empty' ? null : createRun()
  })
  const overview = await getExperimentsOverview()
  expect(getLatestForExperiment).toHaveBeenCalledWith('example')
  expect(getLatestForExperiment).toHaveBeenCalledWith('empty')
  expect(listForExperiment).not.toHaveBeenCalled()
  expect(overview[0]).toMatchObject({id: 'example', date: '2026-09-10', results: {treatments: [{trials: 1}]}})
  expect(Object.keys(overview[0])).toEqual(['id', 'name', 'description', 'date', 'results'])
  expect(overview[1]).toEqual({
    id: 'empty',
    name: experiment.name,
    description: experiment.description,
    date: null,
    results: null,
  })
})

test('does not replace an empty latest run with older results', async () => {
  vi.mocked(listForExperiment).mockResolvedValue([createRun([]), createRun(undefined, '2026-09-09')])
  vi.mocked(getLatestForExperiment).mockResolvedValue(createRun([]))
  expect((await getExperimentPageData('example')).results).toMatchObject({date: '2026-09-10', treatments: []})
  expect(await getExperimentsOverview()).toMatchObject([{date: '2026-09-10', results: {treatments: []}}])
})

test('marks the latest mixed run incomplete without falling back to complete history', async () => {
  const latest = createRun([createErrorTrial(), createResult({scenarioId: 'scenario-b'})])
  vi.mocked(listForExperiment).mockResolvedValue([latest, createRun(undefined, '2026-09-09')])
  vi.mocked(getLatestForExperiment).mockResolvedValue(latest)

  const page = await getExperimentPageData('example')
  const overview = await getExperimentsOverview()

  expect(page.results).toMatchObject({
    status: 'incomplete',
    date: '2026-09-10',
    errors: [{id: 'failed-trial'}],
  })
  expect(page.runs).toEqual([
    {
      id: '2026-09-10',
      name: '2026-09-10',
      resultCount: 2,
      status: 'incomplete',
      errorCount: 1,
      checks: null,
    },
    {
      id: '2026-09-09',
      name: '2026-09-09',
      resultCount: 1,
      status: 'complete',
      errorCount: 0,
      checks: '75.0%',
    },
  ])
  expect(overview[0].results).toEqual(page.results)
})

test('propagates result loading errors instead of displaying an empty success state', async () => {
  vi.mocked(listForExperiment).mockRejectedValue(new Error('Invalid result bundle'))
  vi.mocked(getLatestForExperiment).mockRejectedValue(new Error('Invalid result bundle'))
  await expect(getExperimentsOverview()).rejects.toThrow('Invalid result bundle')
  await expect(getExperimentPageData('example')).rejects.toThrow('Invalid result bundle')
})
