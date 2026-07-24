import {describe, expect, test} from 'vitest'
import {getCopilotArgs} from './run'

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
