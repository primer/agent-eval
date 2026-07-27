import {get, list} from '../../../experiments'
import {Page} from './components/Page'

type ExperimentPageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function ExperimentPage(props: ExperimentPageProps) {
  const params = await props.params
  const id = params.id
  const experiment = await get(id)
  return <Page experiment={experiment} />
}

export async function generateStaticParams() {
  const experiments = await list()
  return experiments.map(experiment => {
    return {
      id: experiment.id,
    }
  })
}
