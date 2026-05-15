const models = ['gpt-5.5', 'claude-opus-4.7'] as const

type Model = (typeof models)[number]

export {models}
export type {Model}
