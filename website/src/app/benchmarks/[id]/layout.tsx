import type {PropsWithChildren} from 'react'
import {get} from '../../../agent-eval/benchmarks'
import {PageHeader} from '../../components/PageHeader'
import {Navigation} from './components/Navigation'

type Props = PropsWithChildren<{
  params: Promise<{id: string}>
}>

export default async function BenchmarkLayout(props: Props) {
  const params = await props.params
  const benchmark = await get({
    id: params.id,
  })

  return (
    <>
      <PageHeader category="benchmarks" benchmark={{href: `/benchmarks/${benchmark.id}`, label: benchmark.name}}>
        <Navigation id={benchmark.id} />
      </PageHeader>
      {props.children}
    </>
  )
}
