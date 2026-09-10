import {list} from '../../../experiments'
import {getExperimentPageData} from '../../../experiment-page-data'
import {Page} from './components/Page'

type ExperimentPageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function ExperimentPage(props: ExperimentPageProps) {
  const params = await props.params
  const id = params.id
  const data = await getExperimentPageData(id)
  return <Page {...data} />
}

export async function generateStaticParams() {
  const experiments = await list()
  return experiments.map(experiment => {
    return {
      id: experiment.id,
    }
  })
}
