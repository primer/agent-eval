import {list, get} from '../../../../agent-eval/benchmarks'
import {Config} from './components/Config'

type Props = {
  params: Promise<{id: string}>
}

export default async function ConfigPage(props: Props) {
  const params = await props.params
  const benchmark = await get({
    id: params.id,
  })

  return (
    <Config
      benchmark={{
        id: benchmark.id,
        name: benchmark.name,
      }}
    />
  )
}

export async function generateStaticParams() {
  const benchmarks = await list()
  return benchmarks.map(benchmark => {
    return {
      id: benchmark.id,
    }
  })
}
