import path from 'node:path'
import type {Host} from './host'
import {isPathInside} from './path'
import type {RunTrialResult} from './trial/run'

type TrialPaths = Pick<Extract<RunTrialResult, {type: 'success'}>, 'artifacts' | 'walkthrough'>

function mapTrialPaths({artifacts, walkthrough}: TrialPaths, map: (filepath: string) => string): TrialPaths {
  const mapWalkthrough = (filepath: string): string => {
    // Older trials record walkthrough paths relative to the sandbox workspace.
    if (filepath.startsWith('walkthrough/')) {
      return map(path.join(artifacts.walkthroughDirectory, filepath.slice('walkthrough/'.length)))
    }
    return map(filepath)
  }

  return {
    artifacts: {
      directory: map(artifacts.directory),
      copilotConfigDirectory: map(artifacts.copilotConfigDirectory),
      skillsConfigDirectory: map(artifacts.skillsConfigDirectory),
      walkthroughDirectory: map(artifacts.walkthroughDirectory),
      workspaceDirectory: map(artifacts.workspaceDirectory),
    },
    walkthrough:
      walkthrough.type === 'Unavailable'
        ? walkthrough
        : walkthrough.type === 'Screenshots'
          ? {
              type: 'Screenshots',
              screenshots: walkthrough.screenshots.map(mapWalkthrough),
            }
          : {
              type: walkthrough.type,
              filepath: mapWalkthrough(walkthrough.filepath),
            },
  }
}

function serializeTrialPaths(trial: TrialPaths, outputDirectory: string): TrialPaths {
  return mapTrialPaths(trial, filepath => {
    return path.relative(path.resolve(outputDirectory), path.resolve(outputDirectory, filepath))
  })
}

function resolveTrialPaths(trial: TrialPaths, outputDirectory: string): TrialPaths {
  return mapTrialPaths(trial, filepath => {
    return path.resolve(outputDirectory, filepath)
  })
}

async function resolveTrialArtifactsPath(host: Host, outputDirectory: string, relativePath: string): Promise<string> {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Trial artifacts must use a bundle-relative path: ${relativePath}`)
  }

  const directory = path.resolve(outputDirectory)
  const filepath = path.resolve(directory, relativePath)
  assertInsideBundle(directory, filepath)

  if (!host.fs.existsSync(filepath)) {
    throw new Error(`Trial artifacts file does not exist: ${filepath}`)
  }

  const realDirectory = await host.fs.promises.realpath(directory)
  const realFilepath = await host.fs.promises.realpath(filepath)
  assertInsideBundle(realDirectory, realFilepath)

  return filepath
}

function assertInsideBundle(directory: string, filepath: string): void {
  if (path.relative(directory, filepath) === '' || !isPathInside(directory, filepath)) {
    throw new Error(`Trial artifacts path must point to a file inside the result bundle: ${filepath}`)
  }
}

export {resolveTrialArtifactsPath, resolveTrialPaths, serializeTrialPaths}
