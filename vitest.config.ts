import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: ['packages/*/vitest.config.ts', 'packages/*/vitest.browser.config.ts', 'website/vitest.config.ts'],
  },
})
