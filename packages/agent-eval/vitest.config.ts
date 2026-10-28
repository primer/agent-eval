import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    name: 'agent-eval',
    environment: 'node',
    tags: [
      {
        name: 'docker',
        description: 'Requires a running Docker daemon',
      },
    ],
    exclude: ['**/artifacts/**', '**/dist/**', '**/node_modules/**', 'e2e/**', '**/*.browser.test.ts'],
  },
})
