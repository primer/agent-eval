import fs from 'node:fs/promises'
import path from 'node:path'
import * as z from 'zod/mini'
import {BenchmarkOutputFileSchema, parseBenchmarkTrialOutput} from '../benchmark/output'
import {ExperimentOutputFileSchema, ExperimentTrialOutputSchema, type ExperimentTrialOutput} from '../experiment/output'
import {DefaultHost} from '../host'
import {resolveTrialArtifactsPath} from '../result-path'
import {RunTrialResultSchema} from '../trial/run'
import {ModelVariantSchema} from '../model'
import {CopilotRunnerSchema} from '../copilot-runner'

// Functions in scenario configuration are omitted when scenario results are serialized.
const ScenarioOutputSchema = z.object({
  id: z.string(),
  results: z.array(
    z.object({
      trial: z.object({id: z.string()}),
      result: z.extend(RunTrialResultSchema, {
        trial: z.object({
          id: z.string(),
          model: ModelVariantSchema,
          runner: z.optional(CopilotRunnerSchema),
          scenario: z.object({id: z.string()}),
          treatment: z.object({id: z.string()}),
        }),
      }),
    }),
  ),
})

type UiRun = {
  id: string
  kind: 'benchmark' | 'experiment' | 'scenario'
  file: string
  trials: Array<ExperimentTrialOutput>
}

type UiResults = {
  runs: Array<UiRun>
  errors: Array<{file: string; message: string}>
}

async function readRun(filepath: string, file: string): Promise<UiRun> {
  const json: unknown = JSON.parse(await fs.readFile(filepath, 'utf8'))
  if (typeof json === 'object' && json !== null && 'results' in json) {
    const output = ScenarioOutputSchema.parse(json)
    return {
      id: output.id,
      kind: 'scenario',
      file,
      trials: output.results.map(({trial, result}) => {
        if (trial.id !== result.trial.id) {
          throw new Error(`Trial ID does not match scenario result: ${trial.id}`)
        }
        return {
          ...result,
          id: trial.id,
          model: result.trial.model,
          runner: result.trial.runner,
          scenarioId: result.trial.scenario.id,
          treatmentId: result.trial.treatment.id,
        }
      }),
    }
  }

  const benchmark = typeof json === 'object' && json !== null && 'capabilities' in json
  const benchmarkOutput = benchmark ? BenchmarkOutputFileSchema.parse(json) : null
  const output = benchmarkOutput ?? ExperimentOutputFileSchema.parse(json)
  const capabilities = benchmarkOutput ? new Map(Object.entries(benchmarkOutput.capabilities)) : null
  const trials: UiRun['trials'] = []
  for (const [id, relativePath] of Object.entries(output.trials)) {
    const trialPath = await resolveTrialArtifactsPath(DefaultHost, path.dirname(filepath), relativePath)
    const data: unknown = JSON.parse(await fs.readFile(trialPath, 'utf8'))
    const trial = capabilities ? parseBenchmarkTrialOutput(data, capabilities) : ExperimentTrialOutputSchema.parse(data)
    if (trial.id !== id) {
      throw new Error(`Trial ID does not match manifest: ${id}`)
    }
    trials.push(trial)
  }
  return {id: output.id, kind: benchmark ? 'benchmark' : 'experiment', file, trials}
}

async function readResults(directory: string): Promise<UiResults> {
  const results: UiResults = {runs: [], errors: []}
  async function visit(current: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(current, {withFileTypes: true})
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return
      }
      throw err
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const filepath = path.join(current, entry.name)
      if (entry.isDirectory() && !['artifacts', 'node_modules'].includes(entry.name) && !entry.name.startsWith('.')) {
        await visit(filepath)
      } else if (entry.isFile() && /^output(?:-\d+)?\.json$/.test(entry.name)) {
        const file = path.relative(directory, filepath)
        try {
          results.runs.push(await readRun(filepath, file))
        } catch (err) {
          results.errors.push({file, message: err instanceof Error ? err.message : String(err)})
        }
      }
    }
  }
  await visit(directory)
  return results
}

export {readResults}
export type {UiResults, UiRun}
