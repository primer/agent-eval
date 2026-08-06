import fs from 'node:fs/promises'
import {existsSync, type Dirent} from 'node:fs'
import path from 'node:path'

import {parseAgentEvalOutput, type AgentEvalOutput} from '@primer/agent-eval/output'

const RESULTS_DIR = path.resolve(process.cwd(), '..', 'results')

type Run = {
  id: string
  name: string
  directory: string
  date: Date
  output: AgentEvalOutput
}

function isRunName(name: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(name)) {
    return false
  }

  const date = new Date(`${name}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(name)
}

async function listResultDirectories(): Promise<Array<Dirent>> {
  try {
    const entries = await fs.readdir(RESULTS_DIR, {withFileTypes: true})
    return entries.filter(entry => entry.isDirectory() && isRunName(entry.name))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }

    throw error
  }
}

async function list(): Promise<Array<Run>> {
  const results = await listResultDirectories().then(entries => {
    return Promise.all(
      entries.map(async entry => {
        const directory = path.join(RESULTS_DIR, entry.name)
        const outputFile = path.join(directory, 'output.json')
        const contents = await fs.readFile(outputFile, 'utf-8')
        const output = parseAgentEvalOutput(contents)
        return [directory, entry.name, output] as const
      }),
    )
  })

  return results
    .map(([directory, name, output]) => {
      const date = new Date(`${name}T00:00:00.000Z`)
      return {id: output.id, name, directory, date, output}
    })
    .toSorted((a, b) => b.date.getTime() - a.date.getTime())
}

async function listForExperiment(experimentId: string): Promise<Array<Run>> {
  const runs = await list()
  return runs.filter(run => run.output.experiment.id === experimentId)
}

async function latest(): Promise<Run | null> {
  const runs = await listResultDirectories().then(entries => {
    return entries.map(entry => [new Date(`${entry.name}T00:00:00.000Z`), entry.name] as const)
  })
  if (runs.length === 0) {
    return null
  }

  const sorted = runs.toSorted((a, b) => b[0].getTime() - a[0].getTime())
  const run = await find(sorted[0][1])
  return run
}

async function find(name: string): Promise<Run | null> {
  if (!isRunName(name)) {
    return null
  }

  const directory = path.join(RESULTS_DIR, name)
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
  const contents = await fs.readFile(outputFile, 'utf-8')
  const output = parseAgentEvalOutput(contents)
  return {
    id: output.id,
    name,
    directory,
    date: new Date(`${name}T00:00:00.000Z`),
    output,
  }
}

async function get(name: string): Promise<Run> {
  const run = await find(name)
  if (!run) {
    throw new Error(`Run "${name}" was not found in: ${RESULTS_DIR}`)
  }

  return run
}

export {list, listForExperiment, latest, get}
export type {Run}
