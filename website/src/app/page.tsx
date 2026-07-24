import {Index} from './components/Index'
import {list as listExperiments} from '../experiments'
import {latest as getLatestRun} from '../runs'
import {list as listScenarios} from '../scenarios'

export default async function IndexPage() {
  const experiments = await listExperiments()
  const latestRun = await getLatestRun()
  const scenarios = await listScenarios()

  return <Index experiments={experiments} latestRun={latestRun} scenarios={scenarios} />
}
