import {test, expect} from 'vitest'
import {getModelVariants, ModelVariantConfigSchema} from './model'

test('ModelVariantConfigSchema accepts a single model config', () => {
  expect(ModelVariantConfigSchema.parse('claude-opus-5')).toBe('claude-opus-5')
  expect(ModelVariantConfigSchema.parse({name: 'claude-opus-5'})).toEqual({name: 'claude-opus-5'})
  expect(ModelVariantConfigSchema.parse({name: 'claude-opus-5', reasoningEfforts: ['medium', 'max']})).toEqual({
    name: 'claude-opus-5',
    reasoningEfforts: ['medium', 'max'],
  })
})

test('ModelVariantConfigSchema rejects arrays and invalid model configs', () => {
  expect(ModelVariantConfigSchema.safeParse([]).success).toBe(false)
  expect(ModelVariantConfigSchema.safeParse(['claude-opus-5']).success).toBe(false)
  expect(ModelVariantConfigSchema.safeParse([{name: 'claude-opus-5'}]).success).toBe(false)
  expect(ModelVariantConfigSchema.safeParse('unknown-model').success).toBe(false)
  expect(ModelVariantConfigSchema.safeParse({name: 'gpt-5.4', reasoningEfforts: ['max']}).success).toBe(false)
})

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
