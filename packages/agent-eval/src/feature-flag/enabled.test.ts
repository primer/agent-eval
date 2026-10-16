import {test, expect} from 'vitest'
import {withEnvironment} from '../env'
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

test('enabled uses the current scoped environment', async () => {
  const initialValue = enabled('ui-command')
  const enabledEnv: Environment = {
    flags: new Map([['ui-command', true]]),
  }
  const disabledEnv: Environment = {
    flags: new Map([['ui-command', false]]),
  }

  await withEnvironment(enabledEnv, async () => {
    expect(enabled('ui-command')).toBe(true)

    await withEnvironment(disabledEnv, async () => {
      expect(enabled('ui-command')).toBe(false)
      await Promise.resolve()
      expect(enabled('ui-command')).toBe(false)
    })

    expect(enabled('ui-command')).toBe(true)
  })

  expect(enabled('ui-command')).toBe(initialValue)
})
