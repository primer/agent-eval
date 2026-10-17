import {listScenarios} from '@primer/agent-eval'
import {scenariosDirectory} from '../../env'

export default async function ScenariosPage() {
  const scenarios = await listScenarios({
    directory: scenariosDirectory,
  })

  return (
    <main>
      <h1>Scenarios</h1>
      <ul>
        {scenarios.map(scenario => {
          return <li key={scenario.id}>{scenario.id}</li>
        })}
      </ul>
    </main>
  )
}
