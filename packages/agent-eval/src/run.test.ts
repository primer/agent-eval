import {describe, expect, test} from 'vitest'
import {parseMessage} from './copilot-cli'
import {getCopilotArgs, getTotalNanoAiu, getVitestConfig} from './run'

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

describe('getVitestConfig', () => {
  test('configures node tests by default', () => {
    const config = getVitestConfig('test-results.json')

    expect(config).toContain(`outputFile: "test-results.json"`)
    expect(config).not.toContain('@vitest/browser-playwright')
  })

  test('configures browser tests with Playwright and Chromium', () => {
    const config = getVitestConfig('browser-test-results.json', true)

    expect(config).toContain(`import {playwright} from '@vitest/browser-playwright'`)
    expect(config).toContain('enabled: true')
    expect(config).toContain('headless: true')
    expect(config).toContain('provider: playwright()')
    expect(config).toContain(`instances: [{browser: 'chromium'}]`)
    expect(config).toContain(`outputFile: "browser-test-results.json"`)
  })
})

describe('getTotalNanoAiu', () => {
  test('returns totalNanoAiu from the latest usage checkpoint', () => {
    const messages = [
      parseMessage({
        type: 'session.usage_checkpoint',
        data: {
          totalNanoAiu: 1_000_000_000,
          totalPremiumRequests: 0,
          modelCacheState: [],
        },
        id: 'first-checkpoint',
        timestamp: '2026-08-27T15:00:00.000Z',
        parentId: 'parent',
      }),
      parseMessage({
        type: 'session.usage_checkpoint',
        data: {
          totalNanoAiu: 2_839_800_000,
          totalPremiumRequests: 0,
          modelCacheState: [],
        },
        id: 'last-checkpoint',
        timestamp: '2026-08-27T15:01:00.000Z',
        parentId: 'first-checkpoint',
      }),
    ]

    expect(getTotalNanoAiu(messages)).toBe(2_839_800_000)
  })

  test('throws when there is no usage checkpoint', () => {
    expect(() => {
      getTotalNanoAiu([])
    }).toThrow('No session usage checkpoint found')
  })
})
