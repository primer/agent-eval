import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    name: 'agent-eval',
    environment: 'node',
    exclude: ['**/artifacts/**', '**/dist/**', '**/node_modules/**', 'e2e/**'],
  },
})
