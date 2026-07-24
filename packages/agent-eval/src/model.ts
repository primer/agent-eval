const models = [
  'claude-haiku-4.5',
  'claude-opus-4.6',
  'claude-opus-4.7',
  'claude-sonnet-4.5',
  'claude-sonnet-4.6',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.5',
] as const

type Model = (typeof models)[number]

export {models}
export type {Model}
