import {ExperimentsTable} from '../components/ResourceTables'
import {list as listExperiments} from '../../experiments'

export const metadata = {
  title: 'Experiments',
}

export default async function ExperimentsPage() {
  const experiments = await listExperiments()
  return <ExperimentsTable experiments={experiments} headingLevel="h1" standalone />
}
