import {afterEach, expect, test, vi} from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

test.each([
  ['development', false],
  ['production', true],
] as const)('configures compression for %s without affecting static export', async (environment, compress) => {
  vi.stubEnv('NODE_ENV', environment)
  vi.resetModules()
  const {default: config} = await import('../next.config')
  expect(config.compress).toBe(compress)
  expect(config.output).toBe('export')
})
