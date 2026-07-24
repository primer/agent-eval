import {describe, expect, test} from 'vitest'
import {models} from './index'
import {resolveModelConfig} from './model'

test('provides model information', () => {
  expect(models).toEqual([
    {name: 'claude-haiku-4.5', supportedReasoningEfforts: []},
    {name: 'claude-opus-4.6', supportedReasoningEfforts: ['low', 'medium', 'high', 'max']},
    {name: 'claude-opus-4.7', supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max']},
    {name: 'claude-sonnet-4.5', supportedReasoningEfforts: []},
    {name: 'claude-sonnet-4.6', supportedReasoningEfforts: ['low', 'medium', 'high', 'max']},
    {name: 'gpt-5.4', supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh']},
    {name: 'gpt-5.4-mini', supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh']},
    {name: 'gpt-5.5', supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh']},
  ])
})

describe('resolveModelConfig', () => {
  test('uses high reasoning effort for a model name', () => {
    expect(resolveModelConfig('gpt-5.5')).toEqual({
      name: 'gpt-5.5',
      reasoningEffort: 'high',
    })
  })

  test('omits reasoning effort for a model that does not support it', () => {
    expect(resolveModelConfig('claude-haiku-4.5')).toEqual({
      name: 'claude-haiku-4.5',
      reasoningEffort: undefined,
    })
  })

  test('preserves a model config', () => {
    expect(
      resolveModelConfig({
        name: 'claude-opus-4.6',
        reasoningEffort: 'max',
      }),
    ).toEqual({
      name: 'claude-opus-4.6',
      reasoningEffort: 'max',
    })
  })
})
