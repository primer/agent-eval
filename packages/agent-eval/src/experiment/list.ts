import path from 'node:path'
import {prettifyError} from 'zod/mini'
import {DefaultHost, type Host} from '../host'
import {logger} from '../logger'
import {getModelVariants} from '../model'
import {getScenario} from '../scenario/get'
import {loadScenario} from '../scenario/load'
import {createTreatment} from '../treatment'
import {ExperimentConfigSchema} from './config'
import {getExperimentId, type Experiment} from './experiment'
import {exhaustiveCheck} from '../exhaustive'
import {getBenchmark} from '../benchmark/get'
import {getConfigPath} from '../path'
import {assertUniqueScenarioIds} from '../scenario/scenario'

const EXPERIMENT_FILE_EXTENSIONS = new Set(['.cjs', '.js', '.mjs', '.ts'])

type ExperimentModule = {
  experiment?: unknown
  default?: unknown
}

type ListExperimentsOptions = {
  benchmarksDirectory: string
  experimentsDirectory: string
  host?: Host
  scenariosDirectory: string
}

async function listExperiments({
  benchmarksDirectory,
  experimentsDirectory,
  host = DefaultHost,
  scenariosDirectory,
}: ListExperimentsOptions): Promise<Array<Experiment>> {
  if (!host.fs.existsSync(experimentsDirectory)) {
    throw new Error(`Experiments directory does not exist: ${experimentsDirectory}`)
  }

  const stats = await host.fs.promises.stat(experimentsDirectory)
  if (!stats.isDirectory()) {
    throw new Error(`Experiments path is not a directory: ${experimentsDirectory}`)
  }

  const filenames = (await host.fs.promises.readdir(experimentsDirectory)).sort()
  const experiments: Array<Experiment> = []

  for (const filename of filenames) {
    if (!isExperimentFile(filename)) {
      continue
    }

    const filepath = path.join(experimentsDirectory, filename)
    if (!(await host.fs.promises.stat(filepath)).isFile()) {
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

    if ('scenarios' in config) {
      const scenarios = await Promise.all(
        config.scenarios.map(scenario => {
          if (typeof scenario === 'string') {
            return getScenario({host, directory: scenariosDirectory, name: scenario})
          }

          const directory = path.resolve(scenario.path)
          return loadScenario({host, directory, name: scenario.name, scenariosDirectory})
        }),
      )

      assertUniqueScenarioIds(scenarios)

      experiments.push({
        type: 'scenario',
        id: config.id ?? getExperimentId(getConfigPath(experimentsDirectory, filepath)),
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
    } else if ('benchmark' in config) {
      const benchmark = await getBenchmark({
        benchmarksDirectory,
        host,
        scenariosDirectory,
        name: config.benchmark,
      })

      experiments.push({
        type: 'benchmark',
        id: config.id ?? getExperimentId(getConfigPath(experimentsDirectory, filepath)),
        filepath,
        name: config.name,
        description: config.description,
        models: getModelVariants(config.models),
        runners: config.runners,
        benchmark,
        setup: config.setup,
        treatments: config.treatments.map(treatment => {
          return createTreatment(treatment)
        }),
      })
    } else {
      exhaustiveCheck(config)
    }
  }

  const ids = new Set<string>()
  for (const experiment of experiments) {
    if (ids.has(experiment.id)) {
      throw new Error(`Duplicate experiment ID: ${experiment.id}`)
    }
    ids.add(experiment.id)
  }

  return experiments
}

function isExperimentFile(filename: string): boolean {
  return (
    !filename.endsWith('.d.ts') && filename !== 'index.ts' && EXPERIMENT_FILE_EXTENSIONS.has(path.extname(filename))
  )
}

export {listExperiments}
