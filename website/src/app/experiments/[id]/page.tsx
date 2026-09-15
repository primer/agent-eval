import {get, list} from '../../../experiments'
import {listForExperiment} from '../../../runs'
import {Page} from './components/Page'
import {formatChecks, summarizeTrials} from '../../../check-results'

type ExperimentPageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function ExperimentPage(props: ExperimentPageProps) {
  const params = await props.params
  const id = params.id
  const [experiment, runs] = await Promise.all([get(id), listForExperiment(id)])
  return (
    <Page
      experiment={experiment}
      runs={runs.map(run => {
        const trials = [...run.output.trials.values()]
        return {
          id: run.id,
          name: run.name,
          resultCount: trials.length,
          checks: formatChecks(summarizeTrials(trials)),
        }
      })}
    />
  )
}

export async function generateStaticParams() {
  const experiments = await list()
  return experiments.map(experiment => {
    return {
      id: experiment.id,
    }
  })
}
