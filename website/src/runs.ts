import fs from 'node:fs/promises'
import {existsSync} from 'node:fs'
import path from 'node:path'

import {parseAgentEvalOutput, type AgentEvalOutput} from '@primer/agent-eval'

const RESULTS_DIR = path.resolve(process.cwd(), '..', 'results')

type Run = {
  id: string
  directory: string
  date: Date
  output: AgentEvalOutput
}

async function list(): Promise<Array<Run>> {
  const results = await fs.readdir(RESULTS_DIR, {withFileTypes: true}).then(entries => {
    return Promise.all(
      entries
        .filter(entry => entry.isDirectory())
        .map(async entry => {
          const directory = path.join(RESULTS_DIR, entry.name)
          const outputFile = path.join(directory, 'output.json')
          const contents = await fs.readFile(outputFile, 'utf-8')
          const output = parseAgentEvalOutput(contents)
          return [directory, entry.name, output] as const
        }),
    )
  })

  return results.map(([directory, name, output]) => {
    const date = new Date(name)
    return {id: output.id, directory, date, output}
  })
}

async function latest(): Promise<Run | null> {
  const runs = await fs.readdir(RESULTS_DIR, {withFileTypes: true}).then(entries => {
    return entries.filter(entry => entry.isDirectory()).map(entry => [new Date(entry.name), entry.name] as const)
  })
  if (runs.length === 0) {
    return null
  }

  const sorted = runs.toSorted((a, b) => b[0].getTime() - a[0].getTime())
  const run = await find(sorted[0][1])
  return run
}

async function find(name: string): Promise<Run | null> {
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
    directory,
    date: new Date(name),
    output,
  }
}

async function get(name: string): Promise<Run> {
  const directory = path.join(RESULTS_DIR, name)
  if (!existsSync(directory)) {
    throw new Error(`Run directory does not exist: ${directory}`)
  }

  if (!existsSync(path.join(directory, 'output.json'))) {
    throw new Error(`Run output file does not exist: ${path.join(directory, 'output.json')}`)
  }

  const stats = await fs.stat(directory)
  if (!stats.isDirectory()) {
    throw new Error(`Run path is not a directory: ${directory}`)
  }

  const outputFile = path.join(directory, 'output.json')
  const contents = await fs.readFile(outputFile, 'utf-8')
  const output = parseAgentEvalOutput(contents)
  return {
    id: output.id,
    directory,
    date: new Date(name),
    output,
  }
}

export {list, latest, get}
export type {Run}
