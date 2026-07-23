import type {Metadata} from 'next'
import {notFound} from 'next/navigation'
import {EvalDetail} from '../../../components/eval-detail'
import {getAllEvals, getEval} from '../../../evals'

type EvalPageProps = {
  params: Promise<{
    id: string
  }>
}

export async function generateStaticParams() {
  const evals = await getAllEvals()
  return evals.map(evalData => ({
    id: evalData.id,
  }))
}

export async function generateMetadata({params}: EvalPageProps): Promise<Metadata> {
  const {id} = await params
  const evalData = await getEval(id)

  if (!evalData) {
    return {
      title: 'Eval not found',
    }
  }

  return {
    title: evalData.title,
    description: evalData.description,
  }
}

export default async function EvalPage({params}: EvalPageProps) {
  const {id} = await params
  const evalData = await getEval(id)

  if (!evalData) {
    notFound()
  }

  return <EvalDetail evalData={evalData} />
}
