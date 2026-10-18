import path from 'node:path'
import {defineConfig} from '@playwright/test'

export default defineConfig({
  // https://playwright.dev/docs/api/class-testconfig#test-config-test-dir
  testDir: path.join(import.meta.dirname, 'e2e', 'ui'),

  // https://playwright.dev/docs/api/class-testconfig#test-config-timeout
  timeout: 1000 * 15,

  // https://playwright.dev/docs/api/class-testconfig#test-config-output-dir
  outputDir: path.join(import.meta.dirname, '.playwright', 'results'),
  snapshotDir: path.join(import.meta.dirname, '.playwright', 'snapshots'),

  use: {
    contextOptions: {
      reducedMotion: 'reduce',
    },
    baseURL: 'http://localhost:3000',
    viewport: {
      width: 1280,
      height: 800,
    },
  },
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
    },
  },
  webServer: {
    command: 'script/setup-test-ui',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
