import githubConfig from '@github/prettier-config'
import {defineConfig} from 'oxfmt'

export default defineConfig({
  ...githubConfig,
  ignorePatterns: [
    '.next',
    'packages/scenarios/src/generated',
    'dist',
    '**/.agents/**',
    '**/*.lock.yml',
    '.github/workflows/agentics-maintenance.yml',
  ],
})
