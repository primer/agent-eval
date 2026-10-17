import {listScenarios} from '@primer/agent-eval-core'
import {scenariosDirectory} from '../../../env'

export const dynamicParams = false

type Props = {
  params: Promise<{id: string}>
}

export default async function ScenarioPage(props: Props) {
  const params = await props.params
  return (
    <>
      <main>
        <h1>Scenario {params.id}</h1>
      </main>
    </>
  )
}

export async function generateStaticParams() {
  const scenarios = await listScenarios({
    directory: scenariosDirectory,
  })

  return scenarios.map(scenario => {
    return {
      id: scenario.id,
    }
  })
}
