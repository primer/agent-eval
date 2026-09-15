import fs from 'node:fs/promises'
import path from 'node:path'
import type {BenchmarkOutput, ExperimentOutput} from '@primer/agent-eval'

const {BenchmarkOutputFileSchema, BenchmarkTrialOutputSchema, ExperimentOutputFileSchema, ExperimentTrialOutputSchema} =
  await import(
    /* turbopackIgnore: true */
    '@primer/agent-eval'
  )

type Bundle<T> = {
  id: string
} & ({output: T; unavailableReason?: never} | {output: null; unavailableReason: string})

async function readTrials<T extends {id: string}>(
  filepath: string,
  trials: Record<string, string>,
  parse: (value: unknown) => T,
): Promise<Map<string, T>> {
  const directory = await fs.realpath(path.dirname(filepath))
  const results = new Map<string, T>()
  for (const [id, relativePath] of Object.entries(trials)) {
    if (path.isAbsolute(relativePath)) {
      throw new Error(`Trial "${id}" must use a bundle-relative path in ${filepath}`)
    }
    const trialPath = await fs.realpath(path.resolve(directory, relativePath))
    const relative = path.relative(directory, trialPath)
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Trial "${id}" points outside the result bundle: ${filepath}`)
    }
    const trial = parse(JSON.parse(await fs.readFile(trialPath, 'utf8')))
    if (trial.id !== id) {
      throw new Error(`Trial ID "${trial.id}" does not match manifest ID "${id}" in ${filepath}`)
    }
    results.set(id, trial)
  }
  return results
}

function getLegacyId(json: unknown, key: string): string | undefined {
  if (typeof json === 'object' && json !== null && key in json && !('id' in json)) {
    const id = Reflect.get(json, key)
    if (typeof id === 'string') {
      return id
    }
  }
  return undefined
}

const LEGACY_RESULTS_MESSAGE =
  'This run uses the pre-refactor result format and cannot be displayed. Regenerate the run with the current agent-eval package.'

async function readBenchmarkOutput(filepath: string): Promise<Bundle<BenchmarkOutput>> {
  const json: unknown = JSON.parse(await fs.readFile(filepath, 'utf8'))
  const legacyId = getLegacyId(json, 'benchmarkId')
  if (legacyId !== undefined) {
    return {id: legacyId, output: null, unavailableReason: LEGACY_RESULTS_MESSAGE}
  }
  const file = BenchmarkOutputFileSchema.parse(json)
  return {
    id: file.id,
    output: {
      id: file.id,
      capabilities: new Map(Object.entries(file.capabilities)),
      scenarios: new Map(Object.entries(file.scenarios)),
      treatments: new Map(Object.entries(file.treatments)),
      trials: await readTrials(filepath, file.trials, BenchmarkTrialOutputSchema.parse),
    },
  }
}

async function readExperimentOutput(filepath: string): Promise<Bundle<ExperimentOutput>> {
  const json: unknown = JSON.parse(await fs.readFile(filepath, 'utf8'))
  const legacyId = getLegacyId(json, 'experimentId')
  if (legacyId !== undefined) {
    return {id: legacyId, output: null, unavailableReason: LEGACY_RESULTS_MESSAGE}
  }
  const file = ExperimentOutputFileSchema.parse(json)
  return {
    id: file.id,
    output: {
      id: file.id,
      scenarios: new Map(Object.entries(file.scenarios)),
      treatments: new Map(Object.entries(file.treatments)),
      trials: await readTrials(filepath, file.trials, ExperimentTrialOutputSchema.parse),
    },
  }
}

export {readBenchmarkOutput, readExperimentOutput}
export type {Bundle}
