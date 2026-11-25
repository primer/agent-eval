import {test, expect} from 'vitest'
import {getModelVariants, models, ModelVariantConfigSchema, ModelVariantSchema} from './model'

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

test('Fusion defaults to the standard tier', () => {
  for (const input of ['fusion', {name: 'fusion'}, {name: 'fusion', reasoningEfforts: []}]) {
    const config = ModelVariantConfigSchema.parse(input)
    expect(getModelVariants([config])).toEqual([{name: 'fusion', reasoningEffort: 'standard'}])
  }
})

test('Fusion expands its supported tiers and rejects other efforts', () => {
  const config = ModelVariantConfigSchema.parse({name: 'fusion', reasoningEfforts: ['standard', 'high', 'max']})
  const variants = [
    {name: 'fusion', reasoningEffort: 'standard'},
    {name: 'fusion', reasoningEffort: 'high'},
    {name: 'fusion', reasoningEffort: 'max'},
  ]
  expect(getModelVariants([config])).toEqual(variants)
  for (const variant of variants) {
    expect(ModelVariantSchema.parse(variant)).toEqual(variant)
  }
  for (const reasoningEffort of ['low', 'medium', 'xhigh', 'unknown']) {
    expect(ModelVariantConfigSchema.safeParse({name: 'fusion', reasoningEfforts: [reasoningEffort]}).success).toBe(
      false,
    )
    expect(ModelVariantSchema.safeParse({name: 'fusion', reasoningEffort}).success).toBe(false)
  }
})

test.each([
  'claude-fable-5',
  'claude-fable-5.1',
  'claude-fable-5.2',
  'claude-haiku-5.5',
  'claude-opus-5.5',
  'claude-sonnet-5.5',
  'gpt-6-astra',
  'gpt-6-luna',
  'gpt-6-sol',
  'gpt-6.1-sol',
  'gpt-6.2-astra',
  'gpt-6.2-sol',
] as const)('%s supports configuration and variant expansion', name => {
  const reasoningEfforts = ['low', 'medium', 'high', 'xhigh', 'max'] as const
  const config = {name, reasoningEfforts: [...reasoningEfforts]}
  expect(ModelVariantConfigSchema.parse(name)).toBe(name)
  expect(ModelVariantConfigSchema.parse(config)).toEqual(config)
  expect(getModelVariants([config])).toEqual(
    reasoningEfforts.map(reasoningEffort => {
      return {name, reasoningEffort}
    }),
  )
  for (const input of [name, {name}, {name, reasoningEfforts: []}]) {
    expect(ModelVariantConfigSchema.parse(input)).toEqual(input)
    expect(getModelVariants([input])).toEqual([{name, reasoningEffort: 'medium'}])
  }
  for (const reasoningEffort of reasoningEfforts) {
    const variant = {name, reasoningEffort}
    expect(ModelVariantSchema.parse(variant)).toEqual(variant)
  }
  for (const reasoningEffort of ['none', 'minimal', 'unknown']) {
    expect(ModelVariantConfigSchema.safeParse({name, reasoningEfforts: [reasoningEffort]}).success).toBe(false)
    expect(ModelVariantSchema.safeParse({name, reasoningEffort}).success).toBe(false)
  }
})

test.each(models)('$name has an object schema for every registered reasoning effort', ({name, reasoningEfforts}) => {
  const config = {name, reasoningEfforts: [...reasoningEfforts]}
  expect(ModelVariantConfigSchema.parse(config)).toEqual(config)
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
