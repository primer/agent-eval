import fs from 'node:fs/promises'
import path from 'node:path'
import type {BenchmarkOutput, ExperimentOutput} from '@primer/agent-eval'
import {core} from 'zod/mini'

const {BenchmarkOutputFileSchema, parseBenchmarkTrialOutput, ExperimentOutputFileSchema, ExperimentTrialOutputSchema} =
  await import(
    /* turbopackIgnore: true */
    '@primer/agent-eval'
  )

type ResultParser<T> = (json: unknown) => T

async function readResultFile<T>(filepath: string, parse: ResultParser<T>): Promise<T | null> {
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
  try {
    return parse(json)
  } catch (error) {
    if (!(error instanceof core.$ZodError)) {
      throw error
    }
    console.warn(`Skipping result bundle with incompatible data in "${filepath}": ${error.message}`)
    return null
  }
}

async function readTrials<T extends {id: string}>(
  filepath: string,
  trials: Record<string, string>,
  parse: ResultParser<T>,
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
    const trial = await readResultFile(trialPath, parse)
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
  const file = await readResultFile(filepath, BenchmarkOutputFileSchema.parse)
  if (file === null) {
    return null
  }
  const capabilities = new Map(Object.entries(file.capabilities))
  const trials = await readTrials(filepath, file.trials, json => {
    return parseBenchmarkTrialOutput(json, capabilities)
  })
  if (trials === null) {
    return null
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
  const file = await readResultFile(filepath, ExperimentOutputFileSchema.parse)
  if (file === null) {
    return null
  }
  const trials = await readTrials(filepath, file.trials, ExperimentTrialOutputSchema.parse)
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
