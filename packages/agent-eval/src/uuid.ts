import {randomUUID} from 'node:crypto'
import {Newtype} from './newtype'

export class Uuid extends Newtype<'Uuid', string> {
  static create() {
    return new Uuid(randomUUID())
  }
}
