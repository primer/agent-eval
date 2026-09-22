import {list as listBenchmarks} from './benchmarks'
import {list as listExperiments, listForScenario} from './experiments'
import {get as getScenario, list as listScenarios} from './scenarios'
import {getBenchmarkPageData} from './benchmark-page-data'
import {getExperimentPageData, getExperimentsOverview} from './experiment-page-data'
import {listBenchmarkRuns} from './benchmark-results'
import {list as listRuns} from './runs'
import {createBenchmarkRunDetails, createExperimentRunDetails} from './run-details'
import {prepareRunDetails} from './app/components/RunDetailsPage'
import type {PageData} from './page-data'

export async function* generatePages(): AsyncGenerator<{path: string; data: PageData}> {
  const [benchmarks, experiments, scenarios] = await Promise.all([listBenchmarks(), listExperiments(), listScenarios()])
  const {benchmark, overview} = await getBenchmarkPageData('design-system')
  yield {path: '/', data: {type: 'overview', benchmark: {benchmark, overview}, experiments: {experiments: await getExperimentsOverview()}}}
  yield {path: '/benchmarks', data: {type: 'benchmarks', props: {benchmarks, headingLevel: 'h1', standalone: true}}}
  yield {path: '/experiments', data: {type: 'experiments', props: {experiments, headingLevel: 'h1', standalone: true}}}
  yield {path: '/scenarios', data: {type: 'scenarios', props: {scenarios, headingLevel: 'h1', standalone: true}}}
  for (const item of benchmarks) {
    const href = `/benchmarks/${encodeURIComponent(item.id)}`
    yield {path: href, data: {type: 'benchmark', props: await getBenchmarkPageData(item.id)}}
    for (const run of await listBenchmarkRuns(item.id)) {
      const resource = {id: item.id, name: item.name, collectionLabel: 'Benchmarks', collectionHref: '/benchmarks', href}
      yield {path: `${href}/runs/${encodeURIComponent(run.name)}`, data: {type: 'run', props: {
        resource, run: prepareRunDetails(resource, await createBenchmarkRunDetails(run)),
      }}}
    }
  }
  for (const item of experiments) {
    yield {path: `/experiments/${encodeURIComponent(item.id)}`, data: {type: 'experiment', props: await getExperimentPageData(item.id)}}
  }
  for (const run of await listRuns()) {
    const experiment = experiments.find(item => item.id === run.experimentId)
    if (!experiment) continue
    const href = `/experiments/${encodeURIComponent(experiment.id)}`
    const resource = {id: experiment.id, name: experiment.name, collectionLabel: 'Experiments', collectionHref: '/experiments', href}
    yield {path: `${href}/runs/${encodeURIComponent(run.name)}`, data: {type: 'run', props: {
      resource, run: prepareRunDetails(resource, await createExperimentRunDetails(run.name, run.output, 'experiments', run.directory)),
    }}}
  }
  for (const item of scenarios) {
    yield {path: `/scenarios/${encodeURIComponent(item.id)}`, data: {type: 'scenario', props: {
      scenario: await getScenario(item.id), experiments: await listForScenario(item.id),
    }}}
  }
}

export async function loadPage(pathname: string): Promise<PageData> {
  const path = pathname.replace(/\/$/, '') || '/'
  for await (const page of generatePages()) {
    if (page.path === path) return page.data
  }
  return {type: 'not-found'}
}
