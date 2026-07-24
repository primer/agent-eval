import {describe, expect, test} from 'vitest'
import {getCopilotArgs, resolveMaxAttempts, retry} from './run'

describe('getCopilotArgs', () => {
  test('omits reasoning effort when not configured', () => {
    expect(
      getCopilotArgs({
        prompt: 'Update the page',
        model: 'claude-haiku-4.5',
      }),
    ).not.toContain('--reasoning-effort')
  })

  test('forwards the model and reasoning effort', () => {
    expect(
      getCopilotArgs({
        prompt: 'Update the page',
        model: 'gpt-5.5',
        reasoningEffort: 'medium',
      }),
    ).toEqual([
      '-p',
      'Update the page',
      '--model',
      'gpt-5.5',
      '--allow-all',
      '--reasoning-effort',
      'medium',
      '--mode',
      'autopilot',
      '--output-format',
      'json',
    ])
  })
})

describe('retry', () => {
  test('returns when an attempt succeeds', async () => {
    let attempts = 0

    const result = await retry(async () => {
      attempts += 1
      if (attempts < 3) {
        throw new Error('failed')
      }
      return 'success'
    }, 3)

    expect(result).toBe('success')
    expect(attempts).toBe(3)
  })

  test('does not exceed the maximum number of attempts', async () => {
    let attempts = 0

    await expect(
      retry(async () => {
        attempts += 1
        throw new Error('failed')
      }, 2),
    ).rejects.toThrow('failed')

    expect(attempts).toBe(2)
  })

  test('rejects an invalid maximum number of attempts', async () => {
    await expect(retry(async () => 'success', 0)).rejects.toThrow('maxAttempts must be at least 1')
  })
})

describe('resolveMaxAttempts', () => {
  test('returns default value for invalid maxAttempts values', () => {
    expect(resolveMaxAttempts(undefined)).toBe(4)
    expect(resolveMaxAttempts(0)).toBe(4)
    expect(resolveMaxAttempts(NaN)).toBe(4)
    expect(resolveMaxAttempts(2.5)).toBe(4)
  })

  test('returns maxAttempts when valid', () => {
    expect(resolveMaxAttempts(1)).toBe(1)
    expect(resolveMaxAttempts(3)).toBe(3)
  })
})
