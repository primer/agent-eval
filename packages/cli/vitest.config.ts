import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    name: 'cli',
    environment: 'node',
    exclude: ['**/artifacts/**', '**/dist/**', '**/node_modules/**'],
  },
})
