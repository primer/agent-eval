import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    name: 'website',
    environment: 'node',
    server: {
      deps: {
        inline: ['@primer/react'],
      },
    },
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
