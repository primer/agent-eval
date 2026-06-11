import {existsSync} from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {find as findPackagedExperiment, list as listPackagedExperiments} from '@primer/agent-experiments'
import type {ExperimentConfig} from '@primer/agent-experiment'

type ExperimentModule = {
  default?: ExperimentConfig
  experiment?: ExperimentConfig
}

type ExperimentSourceOptions = {
  experimentsDirectory?: string
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

async function getLocalExperimentEntries(experimentsDirectory: string): Promise<Array<[string, ExperimentConfig]>> {
  const directory = path.resolve(experimentsDirectory)
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
      const mod = (await import(pathToFileURL(filepath).href)) as ExperimentModule
      const experiment = mod.experiment ?? mod.default
      if (!experiment) {
        throw new Error(`Experiment file must export "experiment" or a default export: ${filepath}`)
      }

      return [getExperimentId(filename), experiment]
    }),
  )
}

async function listExperiments(options: ExperimentSourceOptions = {}): Promise<Array<[string, ExperimentConfig]>> {
  if (options.experimentsDirectory) {
    return getLocalExperimentEntries(options.experimentsDirectory)
  }

  return listPackagedExperiments()
}

async function findExperiment(
  id: string,
  options: ExperimentSourceOptions = {},
): Promise<ExperimentConfig | undefined> {
  if (options.experimentsDirectory) {
    const experiments = await getLocalExperimentEntries(options.experimentsDirectory)
    return experiments.find(([name]) => name === id)?.[1]
  }

  return findPackagedExperiment(id)
}

async function loadExperimentConfigs(options: LoadExperimentOptions = {}): Promise<Array<ExperimentConfig>> {
  if (options.experiment) {
    const experiment = await findExperiment(options.experiment, options)
    return experiment ? [experiment] : []
  }

  return (await listExperiments(options)).map(([, experiment]) => experiment)
}

export {findExperiment, listExperiments, loadExperimentConfigs}
