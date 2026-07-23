import type {ExperimentConfig} from '@primer/agent-experiment'
import fs from 'node:fs/promises'
import path from 'node:path'

const EXPERIMENTS_DIR = import.meta.dirname

const filenames = await fs
  .readdir(EXPERIMENTS_DIR)
  .then(result =>
    result.filter(filename => filename.endsWith('.ts') && !filename.endsWith('.d.ts') && filename !== 'index.ts'),
  )
const modules: Array<[string, ExperimentConfig]> = await Promise.all(
  filenames.map(async filename => {
    const filepath = path.join(EXPERIMENTS_DIR, filename)
    const mod = await import(filepath)
    return [path.basename(filename, '.ts'), mod.experiment]
  }),
)
const experiments: Map<string, ExperimentConfig> = new Map(modules)

function list(): Array<[string, ExperimentConfig]> {
  return Array.from(experiments.entries())
}

function get(id: string): ExperimentConfig {
  const value = experiments.get(id)
  if (value) {
    return value
  }
  throw new Error(`Experiment with id ${id} not found`)
}

function find(id: string): ExperimentConfig | undefined {
  return experiments.get(id)
}

export {list, get, find}
