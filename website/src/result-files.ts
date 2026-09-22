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

// Bound each reader by source bytes as well as entry count.
const MAX_CACHED_BYTES = 64 * 1024 * 1024
const MAX_CACHED_FILES = 128

function createResultReader<T>(schema: ResultSchema<T>) {
  const cache = new Map<string, {version: string; size: number; result: Promise<T | null>}>()
  let cachedBytes = 0

  function remove(filepath: string) {
    const entry = cache.get(filepath)
    if (entry) {
      cachedBytes -= entry.size
      cache.delete(filepath)
    }
  }

  return async (filepath: string): Promise<T | null> => {
    const stats = await fs.stat(filepath)
    const version = `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeMs}:${stats.ctimeMs}`
    const cached = cache.get(filepath)
    if (cached?.version === version) {
      cache.delete(filepath)
      cache.set(filepath, cached)
      return cached.result
    }
    remove(filepath)

    const result = readResultFile(filepath, schema)
    if (stats.size > MAX_CACHED_BYTES) {
      return result
    }
    while (cache.size >= MAX_CACHED_FILES || cachedBytes + stats.size > MAX_CACHED_BYTES) {
      const oldest = cache.keys().next().value
      if (oldest === undefined) {
        break
      }
      remove(oldest)
    }
    cache.set(filepath, {version, size: stats.size, result})
    cachedBytes += stats.size

    try {
      const data = await result
      if (data === null && cache.get(filepath)?.result === result) {
        remove(filepath)
      }
      return data
    } catch (error) {
      if (cache.get(filepath)?.result === result) {
        remove(filepath)
      }
      throw error
    }
  }
}

const readBenchmarkFile = createResultReader(BenchmarkOutputFileSchema)
const readBenchmarkTrial = createResultReader(BenchmarkTrialOutputSchema)
const readExperimentFile = createResultReader(ExperimentOutputFileSchema)
const readExperimentTrial = createResultReader(ExperimentTrialOutputSchema)

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
  readTrial: (filepath: string) => Promise<T | null>,
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
    const trial = await readTrial(trialPath)
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

async function readBenchmarkOutput(filepath: string): Promise<BenchmarkOutput | null> {
  const file = await readBenchmarkFile(filepath)
  if (file === null) {
    return null
  }
  const capabilities = new Map(Object.entries(file.capabilities))
  const trials = await readTrials(filepath, file.trials, readBenchmarkTrial)
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

async function readExperimentOutput(filepath: string): Promise<ExperimentOutput | null> {
  const file = await readExperimentFile(filepath)
  if (file === null) {
    return null
  }
  const trials = await readTrials(filepath, file.trials, readExperimentTrial)
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

export {readBenchmarkOutput, readExperimentOutput}
