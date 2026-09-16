import {BenchmarksTable} from '../components/ResourceTables'
import {list as listBenchmarks} from '../../benchmarks'

export const metadata = {
  title: 'Benchmarks',
}

export default async function BenchmarksPage() {
  const benchmarks = await listBenchmarks()
  return <BenchmarksTable benchmarks={benchmarks} headingLevel="h1" standalone />
}
