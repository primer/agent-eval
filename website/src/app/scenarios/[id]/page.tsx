import {get, list} from '../../../scenarios'
import {Page} from './components/Page'

type ScenarioPageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function ScenarioPage(props: ScenarioPageProps) {
  const params = await props.params
  const id = params.id
  const scenario = await get(id)
  return <Page scenario={scenario} />
}

export async function generateStaticParams() {
  const scenarios = await list()
  return scenarios.map(scenario => {
    return {
      id: scenario.id,
    }
  })
}
