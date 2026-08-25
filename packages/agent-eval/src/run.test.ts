import {describe, expect, test} from 'vitest'
import {getCopilotArgs, getCopilotSdkRunnerScript, getVitestConfig, normalizeCopilotMessage} from './run'

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

describe('getCopilotSdkRunnerScript', () => {
  test('runs prompts in autopilot mode', () => {
    expect(getCopilotSdkRunnerScript()).toContain(`agentMode: 'autopilot'`)
  })
})

describe('normalizeCopilotMessage', () => {
  test('normalizes SDK messages for existing Copilot log parsing', () => {
    expect(
      normalizeCopilotMessage({
        type: 'assistant.message',
        id: 'message-id',
        timestamp: '2026-01-01T00:00:00.000Z',
        parentId: null,
        data: {
          messageId: 'assistant-message-id',
          content: 'Done',
        },
      }),
    ).toEqual({
      type: 'assistant.message',
      id: 'message-id',
      timestamp: '2026-01-01T00:00:00.000Z',
      parentId: '',
      data: {
        messageId: 'assistant-message-id',
        content: 'Done',
        toolRequests: [],
        interactionId: '',
        turnId: '',
        requestId: '',
      },
    })
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
