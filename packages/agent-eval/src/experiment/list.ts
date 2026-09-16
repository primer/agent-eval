import path from 'node:path'
import {prettifyError} from 'zod/mini'
import {DefaultHost, type Host} from '../host'
import {logger} from '../logger'
import {getModelVariants} from '../model'
import {getScenario} from '../scenario/get'
import {loadScenario} from '../scenario/load'
import {createTreatment} from '../treatment'
import {ExperimentConfigSchema} from './config'
import type {Experiment} from './experiment'

const EXPERIMENT_FILE_EXTENSIONS = new Set(['.cjs', '.js', '.mjs', '.ts'])

type ExperimentModule = {
  experiment?: unknown
  default?: unknown
}

type ListExperimentsOptions = {
  experimentsDirectory: string
  host?: Host
  scenariosDirectory: string
}

async function listExperiments({
  experimentsDirectory,
  host = DefaultHost,
  scenariosDirectory,
}: ListExperimentsOptions): Promise<Array<Experiment>> {
  if (!host.existsSync(experimentsDirectory)) {
    throw new Error(`Experiments directory does not exist: ${experimentsDirectory}`)
  }

  const stats = await host.fs.stat(experimentsDirectory)
  if (!stats.isDirectory()) {
    throw new Error(`Experiments path is not a directory: ${experimentsDirectory}`)
  }

  const filenames = (await host.fs.readdir(experimentsDirectory)).sort()
  const experiments: Array<Experiment> = []

  for (const filename of filenames) {
    if (!isExperimentFile(filename)) {
      continue
    }

    const filepath = path.join(experimentsDirectory, filename)
    if (!(await host.fs.stat(filepath)).isFile()) {
      continue
    }

    const mod: ExperimentModule = await host.loadModule(filepath)
    const data = mod.experiment ?? mod.default
    if (!data) {
      continue
    }

    const parseResult = ExperimentConfigSchema.safeParse(data)
    if (!parseResult.success) {
      logger.warn(`Failed to parse experiment config for file: ${filepath}. Error: ${prettifyError(parseResult.error)}`)
      continue
    }

    const {data: config} = parseResult
    const scenarios = await Promise.all(
      config.scenarios.map(scenario => {
        if (typeof scenario === 'string') {
          return getScenario({host, directory: scenariosDirectory, name: scenario})
        }

        const directory = path.resolve(scenario.path)
        return loadScenario({host, directory, name: scenario.name})
      }),
    )

    experiments.push({
      id: getExperimentId(filename),
      filepath,
      name: config.name,
      description: config.description,
      models: getModelVariants(config.models),
      runners: config.runners,
      scenarios,
      setup: config.setup,
      treatments: config.treatments.map(treatment => {
        return createTreatment(treatment)
      }),
    })
  }

  return experiments
}

function getExperimentId(filename: string): string {
  return path.basename(filename, path.extname(filename))
}

function isExperimentFile(filename: string): boolean {
  return (
    !filename.endsWith('.d.ts') && filename !== 'index.ts' && EXPERIMENT_FILE_EXTENSIONS.has(path.extname(filename))
  )
}

export {listExperiments}
