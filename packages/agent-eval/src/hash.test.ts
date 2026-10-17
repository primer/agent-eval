import {expect, test} from 'vitest'
import {getCapabilityId} from './benchmark/benchmark'
import {hash} from './hash'
import {ControlTreatment, getTreatmentId} from './treatment'

test.each([
  ['', '0'],
  ['a', '1009084850'],
  ['foo', '4138058784'],
  ['hello', '613153351'],
  ['\u0161', '2061141819'],
  ['\u{1f680}', '2137479269'],
  ['caf\u00e9', '605818632'],
  ['\u6f22\u5b57', '1467002891'],
  ['abcd\u0161', '2399024199'],
])('hashes %j as UTF-8 using MurmurHash3', (value, expected) => {
  expect(hash(value)).toBe(expected)
})

test('preserves seeded hashing', () => {
  expect(hash('hello', 42)).toBe('3806057185')
})

test('preserves existing ASCII treatment and capability IDs', () => {
  expect(ControlTreatment.id).toBe('375862692')
  expect(getTreatmentId('Benchmark')).toBe('447755367')
  expect(getCapabilityId('Components')).toBe('4026331425')
})

test('distinguishes treatment and capability names with matching low bytes', () => {
  expect(getTreatmentId('\u0161')).toBe('2098803110')
  expect(getTreatmentId('\u0161')).not.toBe(getTreatmentId('a'))
  expect(getCapabilityId('\u0161')).toBe('3357585654')
  expect(getCapabilityId('\u0161')).not.toBe(getCapabilityId('a'))
})
