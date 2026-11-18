import {defineConfig} from 'oxlint'

export default defineConfig({
  plugins: ['typescript', 'import', 'promise'],
  jsPlugins: ['eslint-plugin-github'],
  options: {typeAware: true},
  categories: {correctness: 'error'},
  env: {browser: true, node: true, es2026: true},
  ignorePatterns: [
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/next-env.d.ts',
    '**/generated/**',
    '**/artifacts/**',
    '**/.agents/**',
    '**/out/**',
  ],
  rules: {
    'no-unused-vars': ['error', {argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
    'no-var': 'error',
    'prefer-const': 'error',
    eqeqeq: 'error',
    'github/array-foreach': 'error',
    'github/no-dynamic-script-tag': 'error',
    'github/no-implicit-buggy-globals': 'error',
    'import/no-duplicates': 'error',
    'typescript/no-floating-promises': 'error',
    'typescript/no-misused-promises': 'error',
    'typescript/no-duplicate-type-constituents': 'off',
    'typescript/no-misused-spread': 'off',
    'typescript/no-useless-default-assignment': 'off',
    'typescript/restrict-template-expressions': 'off',
    'typescript/unbound-method': 'off',
  },
  overrides: [
    {
      files: ['packages/agent-eval/src/**/*.ts'],
      excludeFiles: ['packages/agent-eval/src/host.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: 'tar-fs',
                allowTypeImports: true,
                message: 'Use host.archive so archive operations use the host filesystem.',
              },
            ],
          },
        ],
      },
    },
  ],
})
