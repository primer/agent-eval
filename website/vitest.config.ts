import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    name: 'website',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
