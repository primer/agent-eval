import {getBenchmarkPageData} from '../benchmark-page-data'
import {BenchmarkOverview} from './components/BenchmarkOverview'

export default async function IndexPage() {
  const {benchmark, overview} = await getBenchmarkPageData('design-system')
  return <BenchmarkOverview benchmark={benchmark} overview={overview} />
}
