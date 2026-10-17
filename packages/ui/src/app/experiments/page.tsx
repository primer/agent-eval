import {listExperiments} from '@primer/agent-eval-core'
import {benchmarksDirectory, experimentsDirectory, scenariosDirectory} from '../../env'

export default async function ExperimentsPage() {
  const experiments = await listExperiments({
    benchmarksDirectory,
    experimentsDirectory,
    scenariosDirectory,
  })

  return (
    <main>
      <h1>Experiments</h1>
      <ul>
        {experiments.map(experiment => {
          return <li key={experiment.id}>{experiment.name}</li>
        })}
      </ul>
    </main>
  )
}
