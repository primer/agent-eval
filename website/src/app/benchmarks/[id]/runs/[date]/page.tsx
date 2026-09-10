import type {Route} from 'next'
import {notFound} from 'next/navigation'
import {get as getBenchmark, list as listBenchmarks} from '../../../../../benchmarks'
import {getBenchmarkRun, listBenchmarkRuns} from '../../../../../benchmark-results'
import {createBenchmarkRunDetails} from '../../../../../run-details'
import {RunDetailsPage} from '../../../../components/RunDetailsPage'

const EMPTY_RUN_PARAM = '__no-runs__'

type RunPageProps = {
  params: Promise<{
    id: string
    date: string
  }>
}

export const dynamicParams = false

export default async function BenchmarkRunPage(props: RunPageProps) {
  const {id, date} = await props.params
  if (id === EMPTY_RUN_PARAM && date === EMPTY_RUN_PARAM) {
    notFound()
  }

  const [benchmark, run] = await Promise.all([getBenchmark(id), getBenchmarkRun(id, date)])
  if (!run) {
    notFound()
  }

  return (
    <RunDetailsPage
      resource={{
        id: benchmark.id,
        name: benchmark.name,
        collectionLabel: 'Benchmarks',
        collectionHref: '/benchmarks',
        href: `/benchmarks/${benchmark.id}` as Route,
      }}
      run={await createBenchmarkRunDetails(run)}
    />
  )
}

export async function generateStaticParams() {
  const benchmarks = await listBenchmarks()
  const params = (
    await Promise.all(
      benchmarks.map(async benchmark => {
        const runs = await listBenchmarkRuns(benchmark.id)
        return runs.map(run => {
          return {
            id: benchmark.id,
            date: run.name,
          }
        })
      }),
    )
  ).flat()

  return params.length > 0 ? params : [{id: EMPTY_RUN_PARAM, date: EMPTY_RUN_PARAM}]
}
