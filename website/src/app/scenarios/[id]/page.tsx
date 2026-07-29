import type {Metadata} from 'next'
import {listForScenario} from '../../../experiments'
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
  const [scenario, experiments] = await Promise.all([get(id), listForScenario(id)])
  return <Page scenario={scenario} experiments={experiments} />
}

export async function generateMetadata(props: ScenarioPageProps): Promise<Metadata> {
  const {id} = await props.params
  const scenario = await get(id)

  return {
    title: scenario.id,
    description: scenario.prompt,
  }
}

export async function generateStaticParams() {
  const scenarios = await list()
  return scenarios.map(scenario => {
    return {
      id: scenario.id,
    }
  })
}
