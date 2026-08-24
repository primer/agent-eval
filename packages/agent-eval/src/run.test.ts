import {describe, expect, test} from 'vitest'
import {getCopilotArgs, getVitestConfig, getWalkthroughPrompt} from './run'

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

describe('getWalkthroughPrompt', () => {
  test('asks the agent to figure out how to start the server and use agent-browser', () => {
    const prompt = getWalkthroughPrompt()

    expect(prompt).toContain('Figure out how to start')
    expect(prompt).toContain('agent-browser')
    expect(prompt).toContain('walkthrough/screenshot.png')
    expect(prompt).toContain('walkthrough/01-*.png')
    expect(prompt).toContain('walkthrough/walkthrough.webm')
    expect(prompt).toContain('1440x900')
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
