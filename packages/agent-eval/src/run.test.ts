import {describe, expect, test} from 'vitest'
import {getCopilotArgs, getScreenshotScript, getVitestConfig} from './run'

describe('getCopilotArgs', () => {
  test('omits reasoning effort when not configured', () => {
    expect(
      getCopilotArgs({
        prompt: 'Update the page',
        model: 'claude-haiku-4.5',
      }),
    ).not.toContain('--reasoning-effort')
  })

  describe('getScreenshotScript', () => {
    test('captures the viewport at a laptop screen size', () => {
      const script = getScreenshotScript()

      expect(script).toContain("spawn('npm', ['run', 'dev', '--', '--port', '3000']")
      expect(script).toContain("agentBrowser(['set', 'viewport', String(1440), String(900)])")
      expect(script).toContain("agentBrowser(['screenshot', SCREENSHOT_PATH])")
      expect(script).toContain(`const SCREENSHOT_PATH = "ui-snapshot.png"`)
      expect(script).toContain(`const VIDEO_PATH = "ui-snapshot.webm"`)
    })

    test('records a video when the app has multiple pages', () => {
      const script = getScreenshotScript()

      expect(script).toContain("agentBrowser(['record', 'start', VIDEO_PATH])")
      expect(script).toContain("agentBrowser(['record', 'stop'])")
      expect(script).toContain('app-path-routes-manifest.json')
    })
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
