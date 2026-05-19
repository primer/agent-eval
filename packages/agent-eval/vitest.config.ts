import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['**/artifacts/**', '**/dist/**', '**/node_modules/**'],
  },
})
