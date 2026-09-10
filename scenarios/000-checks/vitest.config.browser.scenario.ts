import {playwright} from '@vitest/browser-playwright'
import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    include: ['scenario.browser.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      instances: [
        {
          browser: 'chromium',
        },
      ],
      provider: playwright(),
    },
    reporters: [
      [
        'json',
        {
          outputFile: 'vitest-browser-scenario-report.json',
          includeTaskLocation: true,
        },
      ],
    ],
  },
})
