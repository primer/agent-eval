import fs from 'node:fs/promises'
import path from 'node:path'
import type {BenchmarkOutput, ExperimentOutput} from '@primer/agent-eval'

const {
  BenchmarkOutputFileSchema,
  BenchmarkTrialOutputSchema,
  parseBenchmarkTrialOutput,
  ExperimentOutputFileSchema,
  ExperimentTrialOutputSchema,
} = await import(
  /* turbopackIgnore: true */
  '@primer/agent-eval'
)

type ResultSchema<T> = {
  safeParse: (json: unknown) => {success: true; data: T} | {success: false; error: {message: string}}
}

function cacheResultReader<T>(read: (filepath: string) => Promise<T | null>) {
  // Static exports reuse immutable bundles across thousands of asset routes.
  const bundles = new Map<string, Promise<T | null>>()
  const maxCachedBundles = 2

  return async (filepath: string): Promise<T | null> => {
    if (process.env.NODE_ENV !== 'production') {
      return read(filepath)
    }
    const key = path.resolve(filepath)
    const cached = bundles.get(key)
    if (cached) {
      bundles.delete(key)
      bundles.set(key, cached)
      return cached
    }
    const bundle = read(key)
    bundles.set(key, bundle)
    if (bundles.size > maxCachedBundles) {
      const oldestKey = bundles.keys().next().value
      if (oldestKey !== undefined) {
        bundles.delete(oldestKey)
      }
    }
    try {
      const output = await bundle
      if (output === null && bundles.get(key) === bundle) {
        bundles.delete(key)
      }
      return output
    } catch (error) {
      if (bundles.get(key) === bundle) {
        bundles.delete(key)
      }
      throw error
    }
  }
}

async function readResultFile<T>(filepath: string, schema: ResultSchema<T>): Promise<T | null> {
  const contents = await fs.readFile(filepath, 'utf8')
  let json: unknown
  try {
    json = JSON.parse(contents)
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error
    }
    console.warn(`Skipping result bundle with invalid JSON in "${filepath}": ${error.message}`)
    return null
  }
  const result = schema.safeParse(json)
  if (result.success === false) {
    console.warn(`Skipping result bundle with incompatible data in "${filepath}": ${result.error.message}`)
    return null
  }
  return result.data
}

async function readTrials<T extends {id: string}>(
  filepath: string,
  trials: Record<string, string>,
  schema: ResultSchema<T>,
): Promise<Map<string, T> | null> {
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
    const trial = await readResultFile(trialPath, schema)
    if (trial === null) {
      return null
    }
    if (trial.id !== id) {
      throw new Error(`Trial ID "${trial.id}" does not match manifest ID "${id}" in ${filepath}`)
    }
    results.set(id, trial)
  }
  return results
}

async function loadBenchmarkOutput(filepath: string): Promise<BenchmarkOutput | null> {
  const file = await readResultFile(filepath, BenchmarkOutputFileSchema)
  if (file === null) {
    return null
  }
  const capabilities = new Map(Object.entries(file.capabilities))
  const trials = await readTrials(filepath, file.trials, BenchmarkTrialOutputSchema)
  if (trials === null) {
    return null
  }
  for (const [id, trial] of trials) {
    trials.set(id, parseBenchmarkTrialOutput(trial, capabilities))
  }
  return {
    id: file.id,
    capabilities,
    scenarios: new Map(Object.entries(file.scenarios)),
    treatments: new Map(Object.entries(file.treatments)),
    trials,
  }
}

async function loadExperimentOutput(filepath: string): Promise<ExperimentOutput | null> {
  const file = await readResultFile(filepath, ExperimentOutputFileSchema)
  if (file === null) {
    return null
  }
  const trials = await readTrials(filepath, file.trials, ExperimentTrialOutputSchema)
  if (trials === null) {
    return null
  }
  return {
    id: file.id,
    scenarios: new Map(Object.entries(file.scenarios)),
    treatments: new Map(Object.entries(file.treatments)),
    trials,
  }
}

const readBenchmarkOutput = cacheResultReader(loadBenchmarkOutput)
const readExperimentOutput = cacheResultReader(loadExperimentOutput)

export {readBenchmarkOutput, readExperimentOutput}
