import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {describe, expect, test} from 'vitest'
import {parseMessage} from './copilot-cli'
import {getCopilotArgs, getTotalNanoAiu, getVitestConfig, moveWalkthroughArtifacts} from './run'

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

describe('moveWalkthroughArtifacts', () => {
  test('replaces an existing walkthrough directory before moving', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-eval-run-test-'))
    const workspacePath = path.join(tempDir, 'workspace')
    const walkthroughPath = path.join(tempDir, 'walkthrough')

    await fs.mkdir(path.join(workspacePath, 'walkthrough'), {recursive: true})
    await fs.writeFile(path.join(workspacePath, 'walkthrough', 'screenshot.png'), 'new')
    await fs.mkdir(walkthroughPath, {recursive: true})
    await fs.writeFile(path.join(walkthroughPath, 'stale.txt'), 'old')

    await expect(moveWalkthroughArtifacts(workspacePath, walkthroughPath)).resolves.toBe(true)

    await expect(fs.readFile(path.join(walkthroughPath, 'screenshot.png'), 'utf8')).resolves.toBe('new')
    await expect(fs.access(path.join(walkthroughPath, 'stale.txt'))).rejects.toThrow()
  })

  test('returns false when no walkthrough directory is present', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-eval-run-test-'))
    const workspacePath = path.join(tempDir, 'workspace')
    const walkthroughPath = path.join(tempDir, 'walkthrough')

    await fs.mkdir(workspacePath, {recursive: true})

    await expect(moveWalkthroughArtifacts(workspacePath, walkthroughPath)).resolves.toBe(false)
    await expect(fs.access(walkthroughPath)).rejects.toThrow()
  })
})
