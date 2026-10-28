declare const type: unique symbol

export class Newtype<Type, Value> {
  declare readonly [type]: Type
  #value: Value

  protected constructor(value: Value) {
    this.#value = value
  }

  unwrap(): Value {
    return this.#value
  }
}
