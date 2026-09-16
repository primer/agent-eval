import fs from 'node:fs/promises'
import {existsSync, type Dirent} from 'node:fs'
import path from 'node:path'

import type {ExperimentOutput} from '@primer/agent-eval'
import {readExperimentOutput} from './result-files'

const RESULTS_DIR = path.resolve(process.cwd(), '..', 'results', 'experiments')

type Run = {
  id: string
  experimentId: string
  name: string
  directory: string
  date: Date
  output: ExperimentOutput
}

function isRunName(name: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(name)) {
    return false
  }

  const date = new Date(`${name}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(name)
}

async function listExperimentDirectories(): Promise<Array<Dirent>> {
  try {
    const entries = await fs.readdir(RESULTS_DIR, {withFileTypes: true})
    return entries.filter(entry => {
      return entry.isDirectory()
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }

    throw error
  }
}

async function listRunDirectories(experimentId: string): Promise<Array<Dirent>> {
  const experimentDirectory = path.join(RESULTS_DIR, experimentId)
  try {
    const entries = await fs.readdir(experimentDirectory, {withFileTypes: true})
    return entries.filter(entry => {
      return entry.isDirectory() && isRunName(entry.name)
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }

    throw error
  }
}

async function listForExperiment(experimentId: string): Promise<Array<Run>> {
  const entries = await listRunDirectories(experimentId)
  const runs = await Promise.all(
    entries.map(entry => {
      return find(experimentId, entry.name)
    }),
  )

  return runs
    .filter((run): run is Run => {
      return run !== null
    })
    .toSorted((a, b) => {
      return b.date.getTime() - a.date.getTime()
    })
}

async function getLatestForExperiment(experimentId: string): Promise<Run | null> {
  const entries = (await listRunDirectories(experimentId)).toSorted((first, second) => {
    return second.name.localeCompare(first.name)
  })

  for (const entry of entries) {
    const run = await find(experimentId, entry.name)
    if (run) {
      return run
    }
  }

  return null
}

async function list(): Promise<Array<Run>> {
  const experiments = await listExperimentDirectories()
  const runs = await Promise.all(
    experiments.map(experiment => {
      return listForExperiment(experiment.name)
    }),
  )
  return runs.flat().toSorted((a, b) => {
    return b.date.getTime() - a.date.getTime()
  })
}

async function find(experimentId: string, name: string): Promise<Run | null> {
  if (!isRunName(name)) {
    return null
  }

  const directory = path.join(RESULTS_DIR, experimentId, name)
  if (!existsSync(directory)) {
    return null
  }

  if (!existsSync(path.join(directory, 'output.json'))) {
    return null
  }

  const stats = await fs.stat(directory)
  if (!stats.isDirectory()) {
    return null
  }

  const outputFile = path.join(directory, 'output.json')
  const output = await readExperimentOutput(outputFile)
  if (output === null) {
    return null
  }
  if (output.id !== experimentId) {
    throw new Error(`Experiment ID "${output.id}" does not match "${experimentId}" in ${outputFile}`)
  }

  return {
    id: name,
    experimentId,
    name,
    directory,
    date: new Date(`${name}T00:00:00.000Z`),
    output,
  }
}

async function get(experimentId: string, name: string): Promise<Run> {
  const run = await find(experimentId, name)
  if (!run) {
    throw new Error(`Run "${name}" for experiment "${experimentId}" was not found in: ${RESULTS_DIR}`)
  }

  return run
}

export {list, listForExperiment, getLatestForExperiment, get}
export type {Run}
