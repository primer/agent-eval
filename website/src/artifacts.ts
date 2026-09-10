import path from 'node:path'

const LEGACY_ARTIFACTS_DIRECTORY = path.resolve(process.cwd(), '..', 'artifacts')

function isWithinDirectory(directory: string, filepath: string): boolean {
  const relativePath = path.relative(directory, filepath)
  return relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath)
}

function getArtifactCandidates(artifactPath: string, runDirectory: string): Array<string> {
  const runArtifactsDirectory = path.join(runDirectory, 'artifacts')

  if (!path.isAbsolute(artifactPath)) {
    const candidate = path.resolve(runDirectory, artifactPath)
    return isWithinDirectory(runArtifactsDirectory, candidate) ? [candidate] : []
  }

  if (isWithinDirectory(LEGACY_ARTIFACTS_DIRECTORY, artifactPath)) {
    return [artifactPath]
  }

  const segments = artifactPath.split(/[\\/]+/)
  const artifactsIndex = segments.lastIndexOf('artifacts')
  if (artifactsIndex === -1) {
    return []
  }

  const artifactSegments = segments.slice(artifactsIndex + 1)
  return [
    path.join(runArtifactsDirectory, ...artifactSegments),
    path.join(LEGACY_ARTIFACTS_DIRECTORY, ...artifactSegments),
  ].filter(candidate => {
    return (
      isWithinDirectory(runArtifactsDirectory, candidate) || isWithinDirectory(LEGACY_ARTIFACTS_DIRECTORY, candidate)
    )
  })
}

export {getArtifactCandidates, isWithinDirectory, LEGACY_ARTIFACTS_DIRECTORY}
