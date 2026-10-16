import {test, expect} from 'vitest'
import type {Environment} from '../env'
import {enabled} from './enabled'

test('enabled returns true for enabled flags', () => {
  const env: Environment = {
    flags: new Map([['ui-command', true]]),
  }
  expect(enabled('ui-command', env)).toBe(true)
})

test('enabled returns false for disabled flags', () => {
  const env: Environment = {
    flags: new Map([['ui-command', false]]),
  }
  expect(enabled('ui-command', env)).toBe(false)
})
