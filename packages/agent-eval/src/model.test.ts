import {describe, expect, test} from 'vitest'
import {resolveModelConfig} from './model'

describe('resolveModelConfig', () => {
  test('uses high reasoning effort for a model name', () => {
    expect(resolveModelConfig('gpt-5.5')).toEqual({
      name: 'gpt-5.5',
      reasoningEffort: 'high',
    })
  })

  test('preserves a model config', () => {
    expect(
      resolveModelConfig({
        name: 'gpt-5.5',
        reasoningEffort: 'medium',
      }),
    ).toEqual({
      name: 'gpt-5.5',
      reasoningEffort: 'medium',
    })
  })
})
