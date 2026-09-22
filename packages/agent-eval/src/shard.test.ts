import {expect, test} from 'vitest'
import {parseShard, selectShard} from './shard'

test.each([
  {name: 'an interior shard', input: '2/4', expected: {order: 2, total: 4}},
  {name: 'the first shard', input: '1/4', expected: {order: 1, total: 4}},
  {name: 'the last shard', input: '4/4', expected: {order: 4, total: 4}},
  {name: 'a single shard', input: '1/1', expected: {order: 1, total: 1}},
  {name: 'multi-digit shard numbers', input: '12/16', expected: {order: 12, total: 16}},
])('parseShard parses $name', ({input, expected}) => {
  const shard = parseShard(input)

  expect(shard).toEqual(expected)
})

test.each([
  {name: 'empty input', input: ''},
  {name: 'a missing total', input: '1'},
  {name: 'an extra component', input: '1/2/3'},
  {name: 'leading text', input: 'shard1/2'},
  {name: 'trailing text', input: '1/2shards'},
  {name: 'a fractional order', input: '1.5/2'},
  {name: 'a fractional total', input: '1/2.5'},
  {name: 'a negative order', input: '-1/2'},
])('parseShard rejects $name with format guidance', ({input}) => {
  expect(() => {
    parseShard(input)
  }).toThrow('Shard must use the <order>/<total> format')
})

test.each([
  {name: 'a zero order', input: '0/4'},
  {name: 'an order greater than the total', input: '5/4'},
  {name: 'a zero total', input: '1/0'},
])('parseShard rejects $name with range guidance', ({input}) => {
  expect(() => {
    parseShard(input)
  }).toThrow('Shard order must be between 1 and the total number of shards')
})

test('selectShard partitions uneven input by position while preserving order and duplicates', () => {
  const items = ['c', 'a', 'b', 'c', 'd', 'e', 'f']

  const first = selectShard(items, {order: 1, total: 3})
  const second = selectShard(items, {order: 2, total: 3})
  const third = selectShard(items, {order: 3, total: 3})

  expect(first).toEqual(['c', 'c', 'f'])
  expect(second).toEqual(['a', 'd'])
  expect(third).toEqual(['b', 'e'])
  expect(items).toEqual(['c', 'a', 'b', 'c', 'd', 'e', 'f'])
})

test('selectShard returns every item in order for a single shard', () => {
  const items = ['c', 'a', 'b']

  const selected = selectShard(items, {order: 1, total: 1})

  expect(selected).toEqual(['c', 'a', 'b'])
})

test('selectShard returns no items for an empty input', () => {
  const selected = selectShard([], {order: 1, total: 3})

  expect(selected).toEqual([])
})

test('selectShard leaves excess shards empty when there are fewer items than shards', () => {
  const items = ['a', 'b']

  const first = selectShard(items, {order: 1, total: 3})
  const second = selectShard(items, {order: 2, total: 3})
  const third = selectShard(items, {order: 3, total: 3})

  expect(first).toEqual(['a'])
  expect(second).toEqual(['b'])
  expect(third).toEqual([])
})
