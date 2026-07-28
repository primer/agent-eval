import {describe, expect, test} from 'vitest'
import {parseShard, selectShard} from './shard'

describe(parseShard, () => {
  test('parses a shard', () => {
    expect(parseShard('2/4')).toEqual({order: 2, total: 4})
  })

  test.each(['', '1', '0/4', '5/4', '1/0'])('rejects an invalid shard: %s', shard => {
    expect(() => parseShard(shard)).toThrow()
  })
})

test('selects items for a shard in their defined order', () => {
  expect(selectShard(['a', 'b', 'c', 'd', 'e', 'f'], {order: 2, total: 4})).toEqual(['b', 'f'])
})
