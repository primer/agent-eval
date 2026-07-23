import {existsSync} from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import type {ExperimentConfig} from '@primer/agent-experiment'

type ExperimentModule = {
  default?: ExperimentConfig
  experiment?: ExperimentConfig
}

type ExperimentSourceOptions = {
  directory?: string
}

type LoadExperimentOptions = ExperimentSourceOptions & {
  experiment?: string
}

const EXPERIMENT_FILE_EXTENSIONS = new Set(['.cjs', '.js', '.mjs', '.ts'])

function getExperimentId(filename: string): string {
  return filename.replace(/\.(?:cjs|js|mjs|ts)$/, '')
}

function isExperimentFile(filename: string): boolean {
  if (filename.endsWith('.d.ts')) {
    return false
  }

  return filename !== 'index.ts' && EXPERIMENT_FILE_EXTENSIONS.has(path.extname(filename))
}

async function loadExperimentFile(filepath: string): Promise<ExperimentConfig> {
  const resolvedPath = path.resolve(filepath)
  const mod = (await import(pathToFileURL(resolvedPath).href)) as ExperimentModule
  const experiment = mod.experiment ?? mod.default
  if (!experiment) {
    throw new Error(`Experiment file must export "experiment" or a default export: ${resolvedPath}`)
  }

  return experiment
}

async function getExperimentEntries(sourceDirectory: string): Promise<Array<[string, ExperimentConfig]>> {
  const directory = path.resolve(sourceDirectory)
  if (!existsSync(directory)) {
    throw new Error(`Experiments directory does not exist: ${directory}`)
  }

  const stats = await fs.stat(directory)
  if (!stats.isDirectory()) {
    throw new Error(`Experiments path is not a directory: ${directory}`)
  }

  const filenames = (await fs.readdir(directory)).toSorted()
  return Promise.all(
    filenames.filter(isExperimentFile).map(async filename => {
      const filepath = path.join(directory, filename)
      return [getExperimentId(filename), await loadExperimentFile(filepath)]
    }),
  )
}

async function listExperiments(options: ExperimentSourceOptions = {}): Promise<Array<[string, ExperimentConfig]>> {
  return getExperimentEntries(options.directory ?? 'experiments')
}

async function findExperiment(
  id: string,
  options: ExperimentSourceOptions = {},
): Promise<ExperimentConfig | undefined> {
  if (existsSync(id)) {
    return loadExperimentFile(id)
  }

  const experiments = await getExperimentEntries(options.directory ?? 'experiments')
  return experiments.find(([name]) => name === id)?.[1]
}

async function loadExperimentConfigs(options: LoadExperimentOptions = {}): Promise<Array<ExperimentConfig>> {
  if (options.experiment) {
    const experiment = await findExperiment(options.experiment, options)
    return experiment ? [experiment] : []
  }

  return (await listExperiments(options)).map(([, experiment]) => experiment)
}

export {findExperiment, listExperiments, loadExperimentConfigs}
