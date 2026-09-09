import {get, list} from '../../../experiments'
import {listForExperiment} from '../../../runs'
import {createExperimentOverview} from '../../../experiment-results'
import {Page} from './components/Page'

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
      overview={runs[0] ? createExperimentOverview(runs[0].output) : null}
      runs={runs.map(run => ({
        id: run.id,
        name: run.name,
        resultCount: run.output.results.length,
        passedTests: run.output.results.reduce((total, result) => total + result.testResults.numPassedTests, 0),
        totalTests: run.output.results.reduce((total, result) => total + result.testResults.numTotalTests, 0),
      }))}
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
