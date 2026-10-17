import {listScenarios} from '@primer/agent-eval'
import Link from 'next/link'
import {scenariosDirectory} from '../../env'

export default async function ScenariosPage() {
  const scenarios = await listScenarios({
    directory: scenariosDirectory,
  })

  return (
    <main>
      <nav>
        <ol>
          <li>
            <Link href="/">Home</Link>
          </li>
          <li>
            <Link href="/scenarios" aria-current="true">
              Scenarios
            </Link>
          </li>
        </ol>
      </nav>
      <h1>Scenarios</h1>
      <ul>
        {scenarios.map(scenario => {
          return (
            <li key={scenario.id}>
              <Link href={`/scenarios/${scenario.id}`}>{scenario.id}</Link>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
