import {get as getExperiment, list as listExperiments} from './experiments'
import {getExperimentResults} from './experiment-results'
import {getLatestForExperiment, listForExperiment} from './runs'

export async function getExperimentPageData(id: string) {
  const [experiment, runs] = await Promise.all([getExperiment(id), listForExperiment(id)])
  return {
    experiment,
    results: getExperimentResults(runs[0]),
    runs: runs.map(run => {
      return {
        id: run.id,
        name: run.name,
        resultCount: run.output.results.length,
        passedTests: run.output.results.reduce((total, result) => {
          return total + result.testResults.numPassedTests
        }, 0),
        totalTests: run.output.results.reduce((total, result) => {
          return total + result.testResults.numTotalTests
        }, 0),
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
