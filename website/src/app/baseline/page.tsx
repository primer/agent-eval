import {getBaselinePageData} from '../../baseline-results'
import {Index} from '../components/Index'

export default async function BaselinePage() {
  const {baseline, baselineTrends} = await getBaselinePageData()
  return <Index baseline={baseline} baselineTrends={baselineTrends} />
}
