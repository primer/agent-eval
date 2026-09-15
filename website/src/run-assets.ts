import fs from 'node:fs/promises'
import {getBenchmarkRun, listBenchmarkRuns} from './benchmark-results'
import {list as listBenchmarks} from './benchmarks'
import {get as getExperimentRun, list as listExperimentRuns} from './runs'
import {createTrialDetails, createTrialTranscript, getTrialDataUrl, getWalkthroughAssets} from './run-details'

async function listRunAssetParams(): Promise<Array<{asset: Array<string>}>> {
  const [benchmarks, experiments] = await Promise.all([listBenchmarks(), listExperimentRuns()])
  const benchmarkRuns = await Promise.all(
    benchmarks.map(benchmark => {
      return listBenchmarkRuns(benchmark.id)
    }),
  )
  const runs = [
    ...benchmarkRuns.flat().map(run => {
      return {collection: 'benchmarks' as const, run}
    }),
    ...experiments.map(run => {
      return {collection: 'experiments' as const, run}
    }),
  ]
  const params: Array<{asset: Array<string>}> = []
  for (const {collection, run} of runs) {
    for (const trial of run.output.trials.values()) {
      const baseUrl = getTrialDataUrl(collection, run.output.id, run.name, trial.id)
      const {media} = await getWalkthroughAssets(
        trial.walkthrough,
        run.directory,
        baseUrl,
        trial.artifacts.walkthroughDirectory,
      )
      for (const filename of [
        'details.json',
        'transcript.json',
        ...media.map(asset => {
          return asset.name
        }),
      ]) {
        params.push({asset: [collection, run.output.id, run.name, trial.id, filename]})
      }
    }
  }
  return params.length > 0 ? params : [{asset: ['__no-runs__']}]
}

async function getRunAsset(segments: Array<string>): Promise<Response> {
  if (
    segments.length !== 5 ||
    segments.some(segment => {
      return !segment || segment === '.' || segment === '..' || /[/\\]/.test(segment)
    })
  ) {
    return new Response('Run asset not found', {status: 404})
  }
  const [collection, id, date, trialId, filename] = segments
  if (collection !== 'benchmarks' && collection !== 'experiments') {
    return new Response('Run collection not found', {status: 404})
  }
  const run = collection === 'benchmarks' ? await getBenchmarkRun(id, date) : await getExperimentRun(id, date)
  const trial = run?.output.trials.get(trialId)
  if (!run || !trial) {
    return new Response('Trial not found', {status: 404})
  }
  const baseUrl = getTrialDataUrl(collection, id, date, trialId)
  if (filename === 'details.json') {
    return Response.json(await createTrialDetails(trial, run.directory, baseUrl))
  }
  if (filename === 'transcript.json') {
    return Response.json(createTrialTranscript(trial))
  }
  const {media} = await getWalkthroughAssets(
    trial.walkthrough,
    run.directory,
    baseUrl,
    trial.artifacts.walkthroughDirectory,
  )
  const asset = media.find(candidate => {
    return candidate.name === filename
  })
  if (!asset) {
    return new Response('Media not found', {status: 404})
  }
  return new Response(await fs.readFile(asset.filepath), {
    headers: {'Content-Type': asset.mimeType},
  })
}

export {getRunAsset, listRunAssetParams}
