import {expect, test} from 'vitest'
import {deserialize, output, serialize} from './experiment'

test('serializes and deserializes experiment identity and result maps', () => {
  const experimentOutput = output('baseline', [])
  const serialized = serialize(experimentOutput)

  expect(JSON.parse(serialized)).toEqual({
    experimentId: 'baseline',
    scenarios: {},
    treatments: {},
    trials: {},
  })
  expect(deserialize(serialized)).toEqual({
    experimentId: 'baseline',
    scenarios: new Map(),
    treatments: new Map(),
    trials: new Map(),
  })
})
