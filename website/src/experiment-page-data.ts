import {get as getExperiment, list as listExperiments} from './experiments'
import {getExperimentResults} from './experiment-results'
import {getLatestForExperiment, listForExperiment} from './runs'
import {formatChecks, summarizeTrials} from './check-results'

export async function getExperimentPageData(id: string) {
  const [experiment, runs] = await Promise.all([getExperiment(id), listForExperiment(id)])
  return {
    experiment,
    results: getExperimentResults(runs[0]),
    runs: runs.map(run => {
      const trials = [...run.output.trials.values()]
      return {
        id: run.id,
        name: run.name,
        resultCount: trials.length,
        checks: formatChecks(summarizeTrials(trials)),
      }
    }),
  }
}

export async function getExperimentsOverview() {
  const experiments = await listExperiments()
  return Promise.all(
    experiments.map(async experiment => {
      const run = await getLatestForExperiment(experiment.id)
      const results = getExperimentResults(run ?? undefined)
      return {
        id: experiment.id,
        name: experiment.name,
        description: experiment.description,
        date: results?.date ?? null,
        treatments: results?.treatments ?? [],
      }
    }),
  )
}
