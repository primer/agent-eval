import type {Route} from 'next'
import {notFound} from 'next/navigation'
import {get as getBenchmark} from '../../../benchmarks'
import {get as getExperiment} from '../../../experiments'
import {getRun, listRuns} from '../../../run-catalog'
import {createBenchmarkRunDetails, createExperimentRunDetails} from '../../../run-details'
import {RunDetailsPage} from '../../components/RunDetailsPage'

const EMPTY_RUN_PARAM = '__no-runs__'

export const dynamicParams = false

export default async function RunPage({params}: {params: Promise<{id: string}>}) {
  const {id} = await params
  if (id === EMPTY_RUN_PARAM) {
    notFound()
  }
  const entry = await getRun(id)
  if (!entry) {
    notFound()
  }

  const resource =
    entry.collection === 'benchmarks'
      ? await getBenchmark(entry.run.output.id)
      : await getExperiment(entry.run.output.id)
  const run =
    entry.collection === 'benchmarks'
      ? await createBenchmarkRunDetails(entry.run)
      : await createExperimentRunDetails(entry.run.name, entry.run.output, entry.collection, entry.run.directory)

  return (
    <RunDetailsPage
      resource={{
        id: resource.id,
        name: resource.name,
        collectionLabel: entry.collection === 'benchmarks' ? 'Benchmarks' : 'Experiments',
        collectionHref: `/${entry.collection}`,
        href: `/${entry.collection}/${resource.id}` as Route,
      }}
      run={run}
    />
  )
}

export async function generateStaticParams() {
  const runs = await listRuns()
  return runs.length > 0 ? runs.map(run => ({id: run.id})) : [{id: EMPTY_RUN_PARAM}]
}
