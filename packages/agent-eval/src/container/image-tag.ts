import {createHash} from 'node:crypto'
import {Newtype} from '../newtype'

type CreateImageTagOptions = {
  dockerfile: string
  context?: string
  buildargs?: Record<string, string | undefined>
  files?: Record<string, string | Buffer | undefined>
}

/**
 * A unique identifier for a Docker image built from a specific Dockerfile, context, build arguments, and files.
 */
class ImageTag extends Newtype<'ImageTag', string> {
  static create({dockerfile, context, buildargs, files}: CreateImageTagOptions): ImageTag {
    const hash = createHash('sha256')

    hash.update(dockerfile).update('\0')

    if (context !== undefined) {
      hash.update(context).update('\0')
    }

    if (buildargs) {
      for (const [key, value] of Object.entries(buildargs).sort(([a], [b]) => a.localeCompare(b))) {
        if (value === undefined) {
          continue
        }

        hash.update(key).update('\0').update(value).update('\0')
      }
    }

    if (files) {
      for (const [path, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
        if (content === undefined) {
          continue
        }

        hash.update(path).update('\0').update(content).update('\0')
      }
    }

    return new ImageTag(hash.digest('hex').slice(0, 16))
  }
}

export {ImageTag}
export type {CreateImageTagOptions}
