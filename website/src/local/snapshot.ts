import {createHash} from 'node:crypto'
import type {ExperimentTrialOutput} from '@primer/agent-eval'
import {
  createExperimentRunDetails,
  createTrialDetails,
  createTrialTranscript,
  getWalkthroughAssets,
  type RunDetails,
} from '../run-details'
import {readLocalResults, type LocalRun} from './results'

function mediaPath(run: LocalRun, trial: ExperimentTrialOutput): string {
  return createHash('sha256')
    .update(JSON.stringify([run.file, trial]))
    .digest('hex')
}

function dataUrl(value: unknown): string {
  return `data:application/json;base64,${Buffer.from(JSON.stringify(value)).toString('base64')}`
}

async function createLocalSnapshot() {
  const {runs, errors} = await readLocalResults(process.env.AGENT_EVAL_UI_RESULTS!)
  const results: Array<{id: string; kind: LocalRun['kind']; file: string; details: RunDetails}> = []
  for (const run of runs) {
    try {
      const details = await createExperimentRunDetails(run.file, run.output, 'experiments', run.directory)
      for (const result of details.results) {
        const trial = run.output.trials.get(result.id)!
        const baseUrl = `${process.env.PAGES_BASE_PATH ?? ''}/local-media/${mediaPath(run, trial)}`
        result.detailsUrl = dataUrl(await createTrialDetails(trial, run.directory, baseUrl))
        result.transcriptUrl = dataUrl(createTrialTranscript(trial))
        if ('capabilities' in run.output && 'capabilityId' in trial) {
          const capability = run.output.capabilities.get(trial.capabilityId as string)
          if (capability) result.capability = {id: capability.id, name: capability.name}
        }
      }
      results.push({id: run.output.id, kind: run.kind, file: run.file, details})
    } catch (error) {
      errors.push({file: run.file, message: error instanceof Error ? error.message : String(error)})
    }
  }
  if (process.env.AGENT_EVAL_UI_MODE === 'build' && errors.length > 0) {
    throw new Error(errors.map(error => `${error.file}: ${error.message}`).join('\n'))
  }
  return {runs: results, errors}
}

async function getLocalMedia() {
  const {runs} = await readLocalResults(process.env.AGENT_EVAL_UI_RESULTS!)
  const assets = new Map<string, {filepath: string; mimeType: string}>()
  for (const run of runs) {
    for (const trial of run.output.trials.values()) {
      try {
        const {media} = await getWalkthroughAssets(
          trial.walkthrough,
          run.directory,
          '',
          trial.artifacts.walkthroughDirectory,
        )
        for (const asset of media) assets.set(`${mediaPath(run, trial)}/${asset.name}`, asset)
      } catch {
        // Invalid artifact references are reported with their run in the results view.
      }
    }
  }
  return assets
}

type LocalSnapshot = Awaited<ReturnType<typeof createLocalSnapshot>>

export {createLocalSnapshot, getLocalMedia}
export type {LocalSnapshot}
