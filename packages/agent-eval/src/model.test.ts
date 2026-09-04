import {test, expect} from 'vitest'
import {getModelVariants} from './model'

test('getModelVariants', () => {
  expect(getModelVariants([])).toEqual([])

  expect(getModelVariants(['claude-opus-5'])).toEqual([
    {
      name: 'claude-opus-5',
      reasoningEffort: 'medium',
    },
  ])

  expect(getModelVariants([{name: 'claude-opus-5'}])).toEqual([
    {
      name: 'claude-opus-5',
      reasoningEffort: 'medium',
    },
  ])

  expect(getModelVariants([{name: 'claude-opus-5', reasoningEfforts: []}])).toEqual([
    {
      name: 'claude-opus-5',
      reasoningEffort: 'medium',
    },
  ])

  expect(getModelVariants([{name: 'claude-opus-5', reasoningEfforts: ['medium', 'high']}])).toEqual([
    {
      name: 'claude-opus-5',
      reasoningEffort: 'medium',
    },
    {
      name: 'claude-opus-5',
      reasoningEffort: 'high',
    },
  ])

  expect(getModelVariants(['gpt-5.6-sol', 'gpt-5.6-luna', 'gpt-5.6-terra'])).toEqual([
    {
      name: 'gpt-5.6-sol',
      reasoningEffort: 'medium',
    },
    {
      name: 'gpt-5.6-luna',
      reasoningEffort: 'medium',
    },
    {
      name: 'gpt-5.6-terra',
      reasoningEffort: 'medium',
    },
  ])
})
