import fs from 'node:fs/promises'
import path from 'node:path'
import type {ExperimentConfig, TreatmentConfig} from './config.ts'

const EXPERIMENTS_DIR = path.join(import.meta.dirname, 'experiments')

const filenames = await fs
  .readdir(EXPERIMENTS_DIR)
  .then(filenames => filenames.filter(filename => path.extname(filename) === '.ts'))
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
export type {ExperimentConfig, TreatmentConfig}
export type {Model} from './model'
