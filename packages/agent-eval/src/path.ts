import path from 'node:path'

function isPathInside(directory: string, filepath: string): boolean {
  const relative = path.relative(directory, filepath)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

export {isPathInside}
