import {notFound} from 'next/navigation'
import {getBaselinePageData} from '../../../baseline-results'
import {list as listScenarios} from '../../../scenarios'
import {Index} from '../../components/Index'

export const dynamicParams = false

type BaselineScenarioPageProps = {
  params: Promise<{
    scenarioId: string
  }>
}

export default async function BaselineScenarioPage({params}: BaselineScenarioPageProps) {
  const {scenarioId} = await params
  const [{baseline, baselineTrends}, scenarios] = await Promise.all([getBaselinePageData(), listScenarios()])

  if (!scenarios.some(scenario => scenario.id === scenarioId)) {
    notFound()
  }

  return <Index baseline={baseline} baselineTrends={baselineTrends} selectedScenarioId={scenarioId} />
}

export async function generateStaticParams() {
  const scenarios = await listScenarios()
  return scenarios.map(scenario => ({scenarioId: scenario.id}))
}
