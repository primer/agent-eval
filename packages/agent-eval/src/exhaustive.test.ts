import {expect, expectTypeOf, test} from 'vitest'
import {exhaustiveCheck} from './exhaustive'

test('exhaustiveCheck accepts only never and never returns', () => {
  expectTypeOf<typeof exhaustiveCheck>().toEqualTypeOf<(value: never) => never>()
})

test('exhaustiveCheck throws an Error identifying the unexpected value', () => {
  const value = 'unexpected-variant'

  const check = () => {
    // Bypass the compile-time guard to exercise the runtime safety net.
    exhaustiveCheck(value as never)
  }

  expect(check).toThrow(Error)
  expect(check).toThrow(new Error('Exhaustive check failed: unexpected-variant'))
})
