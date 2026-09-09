import {list as listBenchmarks} from '../../../benchmarks'
import {listBenchmarkRuns} from '../../../benchmark-results'
import {list as listRuns} from '../../../runs'
import {readWorkspaceFiles} from '../../../workspace-files'

export const dynamic = 'force-static'
export const dynamicParams = false

type Workspace = {
  segments: Array<string>
  directory: string
  workspaceDirectory: string
}

let workspaceIndex: Promise<Map<string, Workspace>> | undefined

async function loadWorkspaceIndex() {
  const experiments = (await listRuns()).flatMap(run =>
    run.output.results.map(result => ({
      segments: ['experiments', run.output.experiment.id, run.name, result.id, 'files.json'],
      directory: run.directory,
      workspaceDirectory: result.artifacts.workspaceDirectory,
    })),
  )
  const benchmarks = (
    await Promise.all(
      (await listBenchmarks()).map(async benchmark =>
        (await listBenchmarkRuns(benchmark.id)).flatMap(run =>
          [...run.output.trials.values()].map(trial => ({
            segments: ['benchmarks', benchmark.id, run.name, trial.id, 'files.json'],
            directory: run.directory,
            workspaceDirectory: trial.artifacts.workspaceDirectory,
          })),
        ),
      ),
    )
  ).flat()
  return new Map([...experiments, ...benchmarks].map(workspace => [JSON.stringify(workspace.segments), workspace]))
}

function getWorkspaceIndex() {
  // Reuse only workspace metadata during static export, not the full trial transcripts.
  if (process.env.NODE_ENV !== 'production') {
    return loadWorkspaceIndex()
  }
  return (workspaceIndex ??= loadWorkspaceIndex())
}

export async function generateStaticParams() {
  const params = [...(await getWorkspaceIndex()).values()].map(({segments}) => ({segments}))
  return params.length ? params : [{segments: ['__no-runs__', 'files.json']}]
}

export async function GET(_request: Request, {params}: {params: Promise<{segments: Array<string>}>}) {
  const {segments} = await params
  if (segments.length === 2 && segments[0] === '__no-runs__' && segments[1] === 'files.json') {
    return Response.json({files: [], truncated: false})
  }

  const workspace = (await getWorkspaceIndex()).get(JSON.stringify(segments))
  if (workspace) {
    return Response.json(await readWorkspaceFiles(workspace.workspaceDirectory, workspace.directory))
  }
  return Response.json({files: [], truncated: false}, {status: 404})
}
