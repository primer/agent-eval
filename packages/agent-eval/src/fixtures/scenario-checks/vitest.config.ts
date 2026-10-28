import {defineConfig} from 'vitest/config'

export default defineConfig({
  resolve: {
    preserveSymlinks: true,
  },
  test: {
    cache: false,
    include: ['scenario.test.ts', 'scenario-check.ts'],
    reporters: [
      [
        'json',
        {
          stdout: true,
          includeTaskLocation: true,
        },
      ],
    ],
  },
})
