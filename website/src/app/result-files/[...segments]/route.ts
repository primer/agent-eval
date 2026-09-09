import {list as listBenchmarks} from '../../../benchmarks'
import {getBenchmarkRun, listBenchmarkRuns} from '../../../benchmark-results'
import {get as getRun, list as listRuns} from '../../../runs'
import {readWorkspaceFiles} from '../../../workspace-files'

export const dynamic = 'force-static'
export const dynamicParams = false

export async function generateStaticParams() {
  const experiments = (await listRuns()).flatMap(run =>
    run.output.results.map(result => ({
      segments: ['experiments', run.output.experiment.id, run.name, result.id, 'files.json'],
    })),
  )
  const benchmarks = (
    await Promise.all(
      (await listBenchmarks()).map(async benchmark =>
        (await listBenchmarkRuns(benchmark.id)).flatMap(run =>
          [...run.output.trials.values()].map(trial => ({
            segments: ['benchmarks', benchmark.id, run.name, trial.id, 'files.json'],
          })),
        ),
      ),
    )
  ).flat()
  const params = [...experiments, ...benchmarks]
  return params.length ? params : [{segments: ['__no-runs__', 'files.json']}]
}

export async function GET(_request: Request, {params}: {params: Promise<{segments: Array<string>}>}) {
  const {segments} = await params
  const [collection, id, date, trialId, filename] = segments
  if (segments.length !== 5 || filename !== 'files.json') {
    return Response.json({files: [], truncated: false})
  }

  if (collection === 'experiments') {
    const run = await getRun(id, date)
    const result = run.output.results.find(trial => trial.id === trialId)
    if (result) {
      return Response.json(await readWorkspaceFiles(result.artifacts.workspaceDirectory, run.directory))
    }
  } else if (collection === 'benchmarks') {
    const run = await getBenchmarkRun(id, date)
    const trial = run?.output.trials.get(trialId)
    if (run && trial) {
      return Response.json(await readWorkspaceFiles(trial.artifacts.workspaceDirectory, run.directory))
    }
  }
  return Response.json({files: [], truncated: false}, {status: 404})
}
