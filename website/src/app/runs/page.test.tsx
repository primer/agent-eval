import {renderToStaticMarkup} from 'react-dom/server'
import {beforeEach, expect, test, vi} from 'vitest'
import {notFound} from 'next/navigation'
import {getRun, listRuns, type CatalogRun} from '../../run-catalog'
import {get as getBenchmark} from '../../benchmarks'
import {get as getExperiment} from '../../experiments'
import {createBenchmarkRunDetails, createExperimentRunDetails} from '../../run-details'
import {createBenchmarkOutput, createExperimentOutput} from '../../test-fixtures'
import {RunDetailsPage} from '../components/RunDetailsPage'
import RunsPage from './page'
import RunPage, {generateStaticParams} from './[id]/page'

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('Not found')
  }),
}))
vi.mock('../../run-catalog', () => ({listRuns: vi.fn(), getRun: vi.fn()}))
vi.mock('../../benchmarks', () => ({get: vi.fn()}))
vi.mock('../../experiments', () => ({get: vi.fn()}))
vi.mock('../../run-details', () => ({createBenchmarkRunDetails: vi.fn(), createExperimentRunDetails: vi.fn()}))
vi.mock('../components/RunDetailsPage', () => ({RunDetailsPage: vi.fn(() => null)}))

const date = '2026-09-20'
const run = {id: date, name: date, date: new Date(date), directory: '/results/example'}
const entries: Array<CatalogRun> = [
  {
    id: `benchmarks-example-${date}`,
    collection: 'benchmarks',
    run: {...run, output: {...createBenchmarkOutput([]), id: 'example'}},
  },
  {
    id: `experiments-example-${date}`,
    collection: 'experiments',
    run: {...run, experimentId: 'example', output: {...createExperimentOutput([]), id: 'example'}},
  },
]

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listRuns).mockResolvedValue(entries)
  vi.mocked(getRun).mockResolvedValue(null)
  vi.mocked(getBenchmark).mockResolvedValue({
    id: 'example',
    name: 'Example benchmark',
    description: '',
    models: [],
    capabilities: [],
  })
  vi.mocked(getExperiment).mockResolvedValue({
    id: 'example',
    name: 'Example experiment',
    description: '',
    models: [],
    scenarios: [],
    treatments: [],
  })
  vi.mocked(createBenchmarkRunDetails).mockResolvedValue({date, results: []})
  vi.mocked(createExperimentRunDetails).mockResolvedValue({date, results: []})
})

test('lists both run types with canonical links, including runs with no trials', async () => {
  const html = renderToStaticMarkup(await RunsPage())
  expect(html).toContain('Benchmark')
  expect(html).toContain('Experiment')
  for (const entry of entries) {
    expect(html).toContain(`href="/runs/${entry.id}"`)
  }
  expect(await generateStaticParams()).toEqual(entries.map(({id}) => ({id})))
})

test('renders the no-runs state and exports a not-found placeholder when no bundles exist', async () => {
  vi.mocked(listRuns).mockResolvedValue([])
  expect(renderToStaticMarkup(await RunsPage())).toContain('No results have been recorded yet.')
  expect(await generateStaticParams()).toEqual([{id: '__no-runs__'}])
  await expect(RunPage({params: Promise.resolve({id: '__no-runs__'})})).rejects.toThrow('Not found')
  expect(getRun).not.toHaveBeenCalled()
})

test('unknown run IDs return not found without loading a resource', async () => {
  await expect(RunPage({params: Promise.resolve({id: 'missing'})})).rejects.toThrow('Not found')
  expect(notFound).toHaveBeenCalled()
  expect(getBenchmark).not.toHaveBeenCalled()
  expect(getExperiment).not.toHaveBeenCalled()
})

test.each(entries)('renders $collection through the shared run viewer', async entry => {
  vi.mocked(getRun).mockResolvedValue(entry)
  renderToStaticMarkup(await RunPage({params: Promise.resolve({id: entry.id})}))
  expect(getRun).toHaveBeenCalledWith(entry.id)
  expect(vi.mocked(RunDetailsPage).mock.calls[0][0]).toMatchObject({
    resource: {id: 'example', collectionHref: `/${entry.collection}`, href: `/${entry.collection}/example`},
    run: {date, results: []},
  })
  if (entry.collection === 'benchmarks') {
    expect(createBenchmarkRunDetails).toHaveBeenCalledWith(entry.run)
    expect(createExperimentRunDetails).not.toHaveBeenCalled()
  } else {
    expect(createExperimentRunDetails).toHaveBeenCalledWith(date, entry.run.output, 'experiments', entry.run.directory)
    expect(createBenchmarkRunDetails).not.toHaveBeenCalled()
  }
})
