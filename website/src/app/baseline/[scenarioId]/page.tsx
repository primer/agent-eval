import {notFound} from 'next/navigation'
import {getBaselinePageData} from '../../../baseline-results'
import {Index} from '../../components/Index'

type BaselineScenarioPageProps = {
  params: Promise<{
    scenarioId: string
  }>
}

export default async function BaselineScenarioPage({params}: BaselineScenarioPageProps) {
  const {scenarioId} = await params
  const {baseline, baselineTrends} = await getBaselinePageData()

  if (!baseline?.some(scenario => scenario.scenarioId === scenarioId)) {
    notFound()
  }

  return <Index baseline={baseline} baselineTrends={baselineTrends} selectedScenarioId={scenarioId} />
}

export async function generateStaticParams() {
  const {baseline} = await getBaselinePageData()
  return baseline?.map(scenario => ({scenarioId: scenario.scenarioId})) ?? []
}
