import {randomUUID} from 'node:crypto'
import * as z from 'zod/mini'
import {Newtype} from './newtype'

class Uuid extends Newtype<'Uuid', string> {
  static readonly Schema = z.pipe(
    z.uuid(),
    z.transform(value => {
      return new Uuid(value)
    }),
  )

  static create() {
    return new Uuid(randomUUID())
  }

  static parse(value: unknown) {
    return Uuid.Schema.parse(value)
  }
}

export {Uuid}
