import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {afterEach, describe, expect, test, vi} from 'vitest'
import {copyScreenshotBaselines, getCopilotArgs, getVitestConfig} from './run'

const temporaryDirectories: Array<string> = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => fs.rm(directory, {recursive: true, force: true})))
})

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
    expect(config).toContain('return `${root}/__screenshots__/${testFileName}/${arg}-${browserName}${ext}`')
    expect(config).toContain(`outputFile: "browser-test-results.json"`)
  })
})

describe('copyScreenshotBaselines', () => {
  test('copies scenario-local baselines only during evaluation', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-eval-'))
    temporaryDirectories.push(directory)
    const screenshotsPath = path.join(directory, '__screenshots__')
    await fs.mkdir(screenshotsPath)
    const copy = vi.fn().mockResolvedValue(undefined)

    await copyScreenshotBaselines(
      {copy} as never,
      {
        directory,
      } as never,
    )

    expect(copy).toHaveBeenCalledWith(screenshotsPath, '__screenshots__')
  })

  test('does nothing when a scenario has no baselines', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-eval-'))
    temporaryDirectories.push(directory)
    const copy = vi.fn().mockResolvedValue(undefined)

    await copyScreenshotBaselines(
      {copy} as never,
      {
        directory,
      } as never,
    )

    expect(copy).not.toHaveBeenCalled()
  })
})
