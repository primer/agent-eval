import {ScenariosTable} from '../components/ResourceTables'
import {list as listScenarios} from '../../scenarios'

export const metadata = {title: 'Scenarios'}

export default async function ScenariosPage() {
  const scenarios = await listScenarios()
  return <ScenariosTable scenarios={scenarios} headingLevel="h1" standalone />
}
