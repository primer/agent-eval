import {expect, test} from 'vitest'
import {logger} from './logger'

test('logger uses the default level and is disabled during tests', () => {
  expect(logger.level).toBe('silent')
  expect(logger.isLevelEnabled('info')).toBe(false)
})
