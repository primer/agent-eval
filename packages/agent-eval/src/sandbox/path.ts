import path from 'node:path'
import {CONTAINER_WORKDIR} from './constants'

function resolveContainerPath(filepath: string): string {
  if (path.posix.isAbsolute(filepath)) {
    return path.posix.normalize(filepath)
  }

  return path.posix.resolve(CONTAINER_WORKDIR, filepath)
}

export {resolveContainerPath}
