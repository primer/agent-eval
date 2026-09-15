import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    include: ['scenario.test.ts'],
    reporters: [
      [
        'json',
        {
          outputFile: 'vitest-scenario-report.json',
          includeTaskLocation: true,
        },
      ],
    ],
  },
})
