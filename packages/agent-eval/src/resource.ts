function findResource<T>(
  resources: Array<T>,
  matches: (resource: T) => boolean,
  description: string,
  directory: string,
): T {
  const candidates = resources.filter(matches)
  if (candidates.length > 1) {
    throw new Error(`${description} is ambiguous in: ${directory}`)
  }
  if (candidates.length === 0) {
    throw new Error(`${description} was not found in: ${directory}`)
  }
  return candidates[0]
}

export {findResource}
