import path from 'node:path'
import type {Host} from './host'
import {isPathInside} from './path'

async function resolveTrialArtifactsPath(host: Host, outputDirectory: string, relativePath: string): Promise<string> {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Trial artifacts must use a bundle-relative path: ${relativePath}`)
  }

  const directory = path.resolve(outputDirectory)
  const filepath = path.resolve(directory, relativePath)
  assertInsideBundle(directory, filepath)

  if (!host.existsSync(filepath)) {
    throw new Error(`Trial artifacts file does not exist: ${filepath}`)
  }

  const realDirectory = await host.fs.realpath(directory)
  const realFilepath = await host.fs.realpath(filepath)
  assertInsideBundle(realDirectory, realFilepath)

  return filepath
}

function assertInsideBundle(directory: string, filepath: string): void {
  if (path.relative(directory, filepath) === '' || !isPathInside(directory, filepath)) {
    throw new Error(`Trial artifacts path must point to a file inside the result bundle: ${filepath}`)
  }
}

export {resolveTrialArtifactsPath}
