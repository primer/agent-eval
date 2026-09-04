import path from 'node:path'
import {DefaultHost, type Host} from './host'

type ResultFileOptions = {
  host?: Host
}

async function writeTrialFiles<T extends {artifacts: {directory: string}; id: string}>(
  outputPath: string,
  trials: Map<string, T>,
  options: ResultFileOptions = {},
): Promise<Record<string, string>> {
  const host = options.host ?? DefaultHost
  const outputDirectory = path.dirname(outputPath)
  const entries = await Promise.all(
    [...trials].map(async ([trialId, trial]) => {
      if (trial.id !== trialId) {
        throw new Error(`Trial map key "${trialId}" does not match trial id "${trial.id}"`)
      }

      const artifactDirectory = path.isAbsolute(trial.artifacts.directory)
        ? trial.artifacts.directory
        : path.resolve(outputDirectory, trial.artifacts.directory)
      const trialFilePath = path.join(path.dirname(artifactDirectory), `${trialId}.json`)
      await host.fs.mkdir(path.dirname(trialFilePath), {recursive: true})
      await host.fs.writeFile(trialFilePath, JSON.stringify(trial), 'utf-8')
      const reference = path.relative(outputDirectory, trialFilePath).split(path.sep).join(path.posix.sep)
      return [trialId, reference] as const
    }),
  )

  return Object.fromEntries(entries)
}

async function readTrialFiles<T>(
  outputPath: string,
  references: Record<string, string>,
  parse: (input: unknown) => T,
  options: ResultFileOptions = {},
): Promise<Map<string, T>> {
  const host = options.host ?? DefaultHost
  const outputDirectory = path.dirname(outputPath)
  const entries = await Promise.all(
    Object.entries(references).map(async ([trialId, reference]) => {
      const trialFilePath = path.resolve(outputDirectory, reference)
      const contents = await host.fs.readFile(trialFilePath, 'utf-8')
      const trial = parse(JSON.parse(contents))
      if (
        typeof trial !== 'object' ||
        trial === null ||
        !('id' in trial) ||
        typeof trial.id !== 'string' ||
        trial.id !== trialId
      ) {
        throw new Error(`Trial file "${reference}" does not contain trial id "${trialId}"`)
      }

      return [trialId, trial] as const
    }),
  )

  return new Map(entries)
}

export {readTrialFiles, writeTrialFiles}
export type {ResultFileOptions}
