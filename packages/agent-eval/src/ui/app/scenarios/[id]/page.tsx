import {getScenario, listScenarios} from '../../../agent-eval'
import {Link} from '../../../components/Link'
import {scenariosDirectory} from '../../../env'

export const dynamicParams = false

type Props = {
  params: Promise<{id: string}>
}

export default async function ScenarioPage(props: Props) {
  const params = await props.params
  const scenario = await getScenario({
    directory: scenariosDirectory,
    id: params.id,
  })
  return (
    <>
      <main>
        <nav>
          <ol>
            <li>
              <Link href="/scenarios">Scenarios</Link>
            </li>
            <li>
              <Link href={`/scenarios/${params.id}`} aria-current="page">
                {scenario.name}
              </Link>
            </li>
          </ol>
        </nav>

        <h1>Scenario {scenario.name}</h1>
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
