import {listExperiments} from '@primer/agent-eval'
import Link from 'next/link'
import {benchmarksDirectory, experimentsDirectory, scenariosDirectory} from '../../../env'

export const dynamicParams = false

type Props = {
  params: Promise<{id: string}>
}

export default async function ExperimentPage(props: Props) {
  const params = await props.params
  return (
    <>
      <main>
        <nav>
          <ol>
            <li>
              <Link href="/experiments">Experiments</Link>
            </li>
            <li>
              <Link href={`/experiments/${params.id}`} aria-current="page">
                {params.id}
              </Link>
            </li>
          </ol>
        </nav>
        <h1>Experiment {params.id}</h1>
      </main>
    </>
  )
}

export async function generateStaticParams() {
  const experiments = await listExperiments({
    benchmarksDirectory,
    experimentsDirectory,
    scenariosDirectory,
  })

  return experiments.map(experiment => {
    return {
      id: experiment.id,
    }
  })
}
