import type {Route} from 'next'
import {notFound} from 'next/navigation'
import {get as getExperiment} from '../../../../../experiments'
import {createExperimentRunDetails} from '../../../../../run-details'
import {get as getRun, list as listRuns} from '../../../../../runs'
import {RunDetailsPage} from '../../../../components/RunDetailsPage'

const EMPTY_RUN_PARAM = '__no-runs__'

type RunPageProps = {
  params: Promise<{
    id: string
    date: string
  }>
}

export const dynamicParams = false

export default async function RunPage(props: RunPageProps) {
  const {id, date} = await props.params
  if (id === EMPTY_RUN_PARAM && date === EMPTY_RUN_PARAM) {
    notFound()
  }

  const [experiment, run] = await Promise.all([getExperiment(id), getRun(date)])
  if (run.output.experiment.id !== id) {
    notFound()
  }

  return (
    <RunDetailsPage
      resource={{
        id: experiment.id,
        name: experiment.name,
        collectionLabel: 'Experiments',
        collectionHref: '/experiments',
        href: `/experiments/${experiment.id}` as Route,
      }}
      run={await createExperimentRunDetails(date, run.output, run.directory)}
    />
  )
}

export async function generateStaticParams() {
  const runs = await listRuns()
  if (runs.length === 0) {
    return [{id: EMPTY_RUN_PARAM, date: EMPTY_RUN_PARAM}]
  }

  return runs.map(run => {
    return {
      id: run.output.experiment.id,
      date: run.name,
    }
  })
}
