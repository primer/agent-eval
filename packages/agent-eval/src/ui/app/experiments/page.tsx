import {listExperiments} from '../../agent-eval'
import Link from 'next/link'
import {benchmarksDirectory, experimentsDirectory, scenariosDirectory} from '../../env'

export default async function ExperimentsPage() {
  const experiments = await listExperiments({
    benchmarksDirectory,
    experimentsDirectory,
    scenariosDirectory,
  })

  return (
    <main>
      <nav>
        <ol>
          <li>
            <Link href="/">Home</Link>
          </li>
          <li>
            <Link href="/experiments" aria-current="true">
              Experiments
            </Link>
          </li>
        </ol>
      </nav>
      <h1>Experiments</h1>
      <ul>
        {experiments.map(experiment => {
          return (
            <li key={experiment.id}>
              <Link href={`/experiments/${experiment.id}`}>{experiment.name}</Link>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
