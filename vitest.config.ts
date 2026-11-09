import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: 'scripts',
          environment: 'node',
          include: ['script/**/*.test.ts'],
        },
      },
      'packages/*/vitest.config.ts',
      'packages/*/vitest.browser.config.ts',
      'website/vitest.config.ts',
    ],
  },
})
