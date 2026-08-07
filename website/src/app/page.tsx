import {getBaselinePageData} from '../baseline-results'
import {BaselineOverview} from './components/BaselineOverview'

export default async function IndexPage() {
  const {aggregateResults, aggregateTrends} = await getBaselinePageData()
  return <BaselineOverview results={aggregateResults} trends={aggregateTrends} />
}
