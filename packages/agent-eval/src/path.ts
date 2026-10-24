import path from 'node:path'

function isPathInside(directory: string, filepath: string): boolean {
  const relative = path.relative(directory, filepath)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function getRelativePath(directory: string, filepath: string): string {
  return path.relative(directory, filepath).split(path.sep).join('/')
}

function getConfigPath(directory: string, filepath: string): string {
  const relativePath = getRelativePath(directory, filepath)
  return relativePath.slice(0, relativePath.length - path.extname(relativePath).length)
}

export {getConfigPath, getRelativePath, isPathInside}
