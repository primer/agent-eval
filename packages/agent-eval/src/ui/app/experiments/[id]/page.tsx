import {listExperiments} from '@primer/agent-eval'
import {benchmarksDirectory, experimentsDirectory, scenariosDirectory} from '../../../env'

export const dynamicParams = false

type Props = {
  params: Promise<{id: string}>
}

export default async function BenchmarkPage(props: Props) {
  const params = await props.params
  return (
    <>
      <main>
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
