import fs from 'node:fs/promises'
import path from 'node:path'
import type {BenchmarkOutput, ExperimentOutput, ExperimentTrialOutput} from '@primer/agent-eval'
import {readBenchmarkOutput, readExperimentOutput} from '../result-files'

const {ExperimentTrialOutputSchema} = await import(
  /* turbopackIgnore: true */
  /* webpackIgnore: true */
  '@primer/agent-eval'
)

type LocalRun = {
  kind: 'benchmark' | 'experiment' | 'scenario'
  file: string
  directory: string
  output: ExperimentOutput | BenchmarkOutput
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected a result object')
  }
  return value as Record<string, unknown>
}

async function readRun(filepath: string, file: string): Promise<LocalRun> {
  const json = record(JSON.parse(await fs.readFile(filepath, 'utf8')))
  const directory = path.dirname(filepath)
  if ('results' in json) {
    if (typeof json.id !== 'string' || !Array.isArray(json.results)) throw new Error('Invalid scenario result')
    const trials = new Map<string, ExperimentTrialOutput>()
    for (const value of json.results) {
      const entry = record(value)
      const result = record(entry.result)
      const trial = record(result.trial)
      if (record(entry.trial).id !== trial.id) throw new Error('Trial ID does not match scenario result')
      const parsed = ExperimentTrialOutputSchema.parse({
        ...result,
        id: trial.id,
        model: trial.model,
        runner: trial.runner,
        scenarioId: record(trial.scenario).id,
        treatmentId: record(trial.treatment).id,
      })
      if (trials.has(parsed.id)) throw new Error(`Duplicate trial ID "${parsed.id}"`)
      trials.set(parsed.id, parsed)
    }
    return {
      kind: 'scenario',
      file,
      directory,
      output: {
        id: json.id,
        trials,
        scenarios: new Map(),
        treatments: new Map(
          [...trials.values()].map(trial => [trial.treatmentId, {id: trial.treatmentId, name: trial.treatmentId}]),
        ),
      },
    }
  }
  const benchmark = 'capabilities' in json
  const output = await (benchmark ? readBenchmarkOutput(filepath) : readExperimentOutput(filepath))
  if (!output) throw new Error('Invalid or incompatible result bundle')
  return {kind: benchmark ? 'benchmark' : 'experiment', file, directory, output}
}

async function readLocalResults(
  root: string,
): Promise<{runs: Array<LocalRun>; errors: Array<{file: string; message: string}>}> {
  const runs: Array<LocalRun> = []
  const errors: Array<{file: string; message: string}> = []
  async function read(filepath: string, file: string) {
    try {
      runs.push(await readRun(filepath, file))
    } catch (error) {
      errors.push({file, message: error instanceof Error ? error.message : String(error)})
    }
  }
  async function visit(directory: string) {
    const entries = await fs.readdir(directory, {withFileTypes: true})
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (entry.name.startsWith('.') || ['artifacts', 'node_modules'].includes(entry.name)) continue
      const filepath = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(filepath)
      else if (entry.isFile() && /^output(?:-\d+)?\.json$/.test(entry.name)) {
        await read(filepath, path.relative(root, filepath))
      }
    }
  }
  try {
    if ((await fs.stat(root)).isFile()) await read(root, path.basename(root))
    else await visit(root)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      errors.push({file: path.basename(root), message: error instanceof Error ? error.message : String(error)})
    }
  }
  return {runs, errors}
}

export {readLocalResults}
export type {LocalRun}
