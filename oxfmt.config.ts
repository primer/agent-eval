import {defineConfig} from 'oxfmt'

export default defineConfig({
  printWidth: 120,
  semi: false,
  singleQuote: true,
  bracketSpacing: false,
  trailingComma: 'all',
  arrowParens: 'avoid',
  ignorePatterns: [
    '.next',
    'packages/scenarios/src/generated',
    'dist',
    '**/.agents/**',
    '**/*.lock.yml',
    '.github/workflows/agentics-maintenance.yml',
  ],
})
