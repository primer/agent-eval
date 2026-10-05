import {list, get} from '../../../../agent-eval/benchmarks'

type Props = {
  params: Promise<{id: string}>
}

export default async function CapabilitiesPage(props: Props) {
  const params = await props.params
  const benchmark = await get({
    id: params.id,
  })

  return 'hi'
}

export async function generateStaticParams() {
  const benchmarks = await list()
  return benchmarks.map(benchmark => {
    return {
      id: benchmark.id,
    }
  })
}
