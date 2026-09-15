import {DefaultHost, type Host} from '../host'

type ScenarioSourceOptions = {
  host?: Host
  directory: string
}

function getScenarioSource(
  hostOrOptions: Host | ScenarioSourceOptions,
  directory?: string,
): {host: Host; directory: string} {
  if (directory !== undefined) {
    return {
      host: hostOrOptions as Host,
      directory,
    }
  }

  const options = hostOrOptions as ScenarioSourceOptions
  return {
    host: options.host ?? DefaultHost,
    directory: options.directory,
  }
}

export {getScenarioSource}
export type {ScenarioSourceOptions}
