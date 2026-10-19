import {getExperiment, listExperiments} from '../../../agent-eval'
import {Link} from '../../../components/Link'
import {benchmarksDirectory, experimentsDirectory, scenariosDirectory} from '../../../env'

export const dynamicParams = false

type Props = {
  params: Promise<{id: string}>
}

export default async function ExperimentPage(props: Props) {
  const params = await props.params
  const experiment = await getExperiment({
    benchmarksDirectory,
    experimentsDirectory,
    scenariosDirectory,
    id: params.id,
  })
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
                {experiment.name}
              </Link>
            </li>
          </ol>
        </nav>
        <h1>Experiment {experiment.name}</h1>
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
