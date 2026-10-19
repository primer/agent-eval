import {getBenchmarkPageData} from '../benchmark-page-data'
import {getBenchmarkId} from '../benchmarks'
import {BenchmarkOverview} from './components/BenchmarkOverview'
import {getExperimentsOverview} from '../experiment-page-data'
import {ExperimentsOverview} from './components/ExperimentResults'

export default async function IndexPage() {
  const [{benchmark, overview}, experiments] = await Promise.all([
    getBenchmarkPageData(getBenchmarkId('design-system')),
    getExperimentsOverview(),
  ])
  return (
    <>
      <BenchmarkOverview benchmark={benchmark} overview={overview} />
      <ExperimentsOverview experiments={experiments} />
    </>
  )
}
