import {beforeEach, expect, test, vi} from 'vitest'
import {getExperimentPageData, getExperimentsOverview} from './experiment-page-data'
import {get, list} from './experiments'
import {getLatestForExperiment, listForExperiment} from './runs'
import {createResult, createRun} from './test/experiment'

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
    {id: '2026-09-10', name: '2026-09-10', resultCount: 1, passedTests: 3, totalTests: 4},
    {id: '2026-09-09', name: '2026-09-09', resultCount: 2, passedTests: 6, totalTests: 8},
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
  expect(overview[0]).toMatchObject({id: 'example', date: '2026-09-10', treatments: [{trials: 1}]})
  expect(Object.keys(overview[0])).toEqual(['id', 'name', 'description', 'date', 'treatments'])
  expect(overview[1]).toEqual({
    id: 'empty',
    name: experiment.name,
    description: experiment.description,
    date: null,
    treatments: [],
  })
})

test('does not replace an empty latest run with older results', async () => {
  vi.mocked(listForExperiment).mockResolvedValue([createRun([]), createRun(undefined, '2026-09-09')])
  vi.mocked(getLatestForExperiment).mockResolvedValue(createRun([]))
  expect((await getExperimentPageData('example')).results).toMatchObject({date: '2026-09-10', treatments: []})
  expect(await getExperimentsOverview()).toMatchObject([{date: '2026-09-10', treatments: []}])
})

test('propagates result loading errors instead of displaying an empty success state', async () => {
  vi.mocked(listForExperiment).mockRejectedValue(new Error('Invalid result bundle'))
  vi.mocked(getLatestForExperiment).mockRejectedValue(new Error('Invalid result bundle'))
  await expect(getExperimentsOverview()).rejects.toThrow('Invalid result bundle')
  await expect(getExperimentPageData('example')).rejects.toThrow('Invalid result bundle')
})
