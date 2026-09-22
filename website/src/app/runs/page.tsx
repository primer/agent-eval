import {listRuns} from '../../run-catalog'
import {RunsTable} from '../components/ResourceTables'

export const metadata = {title: 'Runs'}

export default async function RunsPage() {
  const runs = await listRuns()
  return (
    <RunsTable
      runs={runs.map(({id, collection, run}) => {
        return {
          id,
          collection,
          resourceId: run.output.id,
          date: run.name,
          trials: run.output.trials.size,
        }
      })}
    />
  )
}
