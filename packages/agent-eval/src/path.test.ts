import path from 'node:path'
import {expect, test} from 'vitest'
import {isPathInside} from './path'

test('isPathInside accepts a direct descendant', () => {
  const directory = path.resolve('path-test/scenario')
  const filepath = path.join(directory, 'check.ts')

  const result = isPathInside(directory, filepath)

  expect(result).toBe(true)
})

test('isPathInside accepts a nested descendant', () => {
  const directory = path.resolve('path-test/scenario')
  const filepath = path.join(directory, 'nested/check.ts')

  const result = isPathInside(directory, filepath)

  expect(result).toBe(true)
})

test('isPathInside includes the directory itself', () => {
  const directory = path.resolve('path-test/scenario')

  const result = isPathInside(directory, directory)

  expect(result).toBe(true)
})

test('isPathInside rejects the immediate parent', () => {
  const directory = path.resolve('path-test/scenario')
  const filepath = path.resolve(directory, '..')

  const result = isPathInside(directory, filepath)

  expect(result).toBe(false)
})

test('isPathInside rejects a higher ancestor', () => {
  const directory = path.resolve('path-test/scenario')
  const filepath = path.resolve(directory, '../..')

  const result = isPathInside(directory, filepath)

  expect(result).toBe(false)
})

test('isPathInside rejects a sibling directory that shares the directory name prefix', () => {
  const directory = path.resolve('path-test/scenario')
  const filepath = path.resolve('path-test/scenario-copy/check.ts')

  const result = isPathInside(directory, filepath)

  expect(result).toBe(false)
})

test('isPathInside accepts a descendant filename beginning with two dots', () => {
  const directory = path.resolve('path-test/scenario')
  const filepath = path.join(directory, '..config')

  const result = isPathInside(directory, filepath)

  expect(result).toBe(true)
})

test('isPathInside accepts a descendant in a directory named with three dots', () => {
  const directory = path.resolve('path-test/scenario')
  const filepath = path.join(directory, '.../check.ts')

  const result = isPathInside(directory, filepath)

  expect(result).toBe(true)
})

test('isPathInside normalizes dot segments and trailing separators before accepting a descendant', () => {
  const base = path.resolve('path-test/scenario')
  const directory = `${base}${path.sep}.${path.sep}`
  const filepath = `${base}${path.sep}nested${path.sep}..${path.sep}check.ts`

  const result = isPathInside(directory, filepath)

  expect(result).toBe(true)
})

test('isPathInside rejects a path that escapes through a parent segment', () => {
  const directory = path.resolve('path-test/scenario')
  const filepath = `${directory}${path.sep}..${path.sep}outside${path.sep}check.ts`

  const result = isPathInside(directory, filepath)

  expect(result).toBe(false)
})

test('isPathInside accepts relative directory and descendant paths', () => {
  const directory = 'path-test/scenario'
  const filepath = 'path-test/scenario/nested/check.ts'

  const result = isPathInside(directory, filepath)

  expect(result).toBe(true)
})

test('isPathInside resolves a relative filepath from the working directory, not the supplied directory', () => {
  const directory = path.resolve('path-test/scenario')
  const filepath = 'path-test/check.ts'

  const result = isPathInside(directory, filepath)

  expect(result).toBe(false)
})
