import {expect, test, vi} from 'vitest'
import {getBenchmarkPageData} from './benchmark-page-data'
import {listBenchmarkRuns, type BenchmarkRun} from './benchmark-results'
import {createBenchmarkOutput, createErrorTrial, createTrial} from './test-fixtures'

vi.mock('./benchmarks', () => {
  return {
    get: vi.fn(async () => {
      return {
        id: 'example',
        name: 'Example',
        description: 'Example benchmark',
        models: [],
        capabilities: [],
      }
    }),
  }
})

vi.mock('./benchmark-results', async importOriginal => {
  const original = await importOriginal<typeof import('./benchmark-results')>()
  return {
    ...original,
    listBenchmarkRuns: vi.fn(),
  }
})

function createRun(date: string, output: BenchmarkRun['output']): BenchmarkRun {
  return {
    id: date,
    name: date,
    directory: `/results/${date}`,
    date: new Date(date),
    output,
  }
}

test('keeps an all-error latest benchmark visible and only charts completed historical evaluations', async () => {
  const latest = createRun('2026-09-15', createBenchmarkOutput([createErrorTrial()]))
  const historical = createRun(
    '2026-09-14',
    createBenchmarkOutput([
      createTrial(),
      createTrial({
        id: 'benchmark',
        treatmentId: 'benchmark',
      }),
    ]),
  )
  vi.mocked(listBenchmarkRuns).mockResolvedValue([latest, historical])

  const page = await getBenchmarkPageData('example')

  expect(page.results).toMatchObject({
    status: 'incomplete',
    date: '2026-09-15',
    errors: [{id: 'failed-trial'}],
  })
  expect(page.overview).toMatchObject({
    status: 'incomplete',
    date: '2026-09-15',
    results: [],
  })
  expect(page.overview.trends.length).toBeGreaterThan(0)
  expect(
    page.overview.trends.every(point => {
      return point.date === '2026-09-14'
    }),
  ).toBe(true)
  expect(page.runs).toEqual([
    {
      id: '2026-09-15',
      name: '2026-09-15',
      resultCount: 1,
      status: 'incomplete',
      errorCount: 1,
      checks: null,
    },
    {
      id: '2026-09-14',
      name: '2026-09-14',
      resultCount: 2,
      status: 'complete',
      errorCount: 0,
      checks: '15 ms [2 errors]; 50.0% [2 skipped; 2 errors]',
    },
  ])
})
