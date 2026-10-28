import {Newtype} from '../newtype'
import type {ImageTag} from './image-tag'

type CreateImageReferenceOptions = {
  path: string
  namespace?: string
  tag: ImageTag
}

/**
 * An ImageReference is a string that represents a reference to a container image, namely in the format of "name:tag".
 */
export class ImageReference extends Newtype<'ImageReference', string> {
  static create({namespace, path, tag}: CreateImageReferenceOptions): ImageReference {
    let name = path
    if (namespace) {
      name = `${namespace}/${path}`
    }
    return new ImageReference(`${name}:${tag.unwrap()}`)
  }
}
