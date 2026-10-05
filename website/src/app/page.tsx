import {getBenchmarkPageDataByName} from '../benchmark-page-data'
import {BenchmarkOverview} from './components/BenchmarkOverview'
import {getExperimentsOverview} from '../experiment-page-data'
import {ExperimentsOverview} from './components/ExperimentResults'

export default async function IndexPage() {
  const [{benchmark, overview}, experiments] = await Promise.all([
    getBenchmarkPageDataByName('design-system'),
    getExperimentsOverview(),
  ])
  return (
    <>
      <BenchmarkOverview benchmark={benchmark} overview={overview} />
      <ExperimentsOverview experiments={experiments} />
    </>
  )
}
