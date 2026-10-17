export function exhaustiveCheck(value: never): never {
  throw new Error(`Exhaustive check failed: ${value}`)
}
