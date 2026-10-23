import {ExperimentsTable} from '../components/ResourceTables'
import {list as listExperiments} from '../../experiments'
import {getLatestForExperiment} from '../../runs'
import {getRunSummary} from '../../evaluation-state'

export const metadata = {
  title: 'Experiments',
}

export default async function ExperimentsPage() {
  const experiments = await Promise.all(
    (await listExperiments()).map(async experiment => {
      const run = await getLatestForExperiment(experiment.id)
      return {
        ...experiment,
        latestRun: run
          ? {
              date: run.name,
              ...getRunSummary(run.output.trials.values()),
            }
          : null,
      }
    }),
  )
  return <ExperimentsTable experiments={experiments} headingLevel="h1" standalone />
}
