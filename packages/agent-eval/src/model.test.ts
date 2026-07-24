import {describe, expect, test} from 'vitest'
import {models} from './index'
import {resolveModelConfigs} from './model'

test('provides model information', () => {
  expect(models).toEqual([
    {name: 'claude-haiku-4.5', reasoningEfforts: []},
    {name: 'claude-opus-4.6', reasoningEfforts: ['low', 'medium', 'high', 'max']},
    {name: 'claude-opus-4.7', reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max']},
    {name: 'claude-sonnet-4.5', reasoningEfforts: []},
    {name: 'claude-sonnet-4.6', reasoningEfforts: ['low', 'medium', 'high', 'max']},
    {name: 'gpt-5.4', reasoningEfforts: ['low', 'medium', 'high', 'xhigh']},
    {name: 'gpt-5.4-mini', reasoningEfforts: ['low', 'medium', 'high', 'xhigh']},
    {name: 'gpt-5.5', reasoningEfforts: ['low', 'medium', 'high', 'xhigh']},
  ])
})

describe('resolveModelConfigs', () => {
  test('resolves each reasoning effort for a model', () => {
    expect(resolveModelConfigs({name: 'gpt-5.5', reasoningEfforts: ['low', 'high']})).toEqual([
      {
        name: 'gpt-5.5',
        reasoningEffort: 'low',
      },
      {
        name: 'gpt-5.5',
        reasoningEffort: 'high',
      },
    ])
  })

  test('omits reasoning effort for a model without supported efforts', () => {
    expect(resolveModelConfigs({name: 'claude-haiku-4.5', reasoningEfforts: []})).toEqual([
      {
        name: 'claude-haiku-4.5',
      },
    ])
  })
})
