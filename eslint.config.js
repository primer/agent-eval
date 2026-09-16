import js from '@eslint/js'
import {defineConfig, globalIgnores} from 'eslint/config'
import githubPlugin from 'eslint-plugin-github'
import globals from 'globals'

const github = githubPlugin.getFlatConfigs()

/**
 * @type {import('@eslint/js').FlatConfig}
 */
const config = defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/next-env.d.ts',
    '**/generated/**',
    '**/artifacts/**',
    '**/.agents/**',
    // Next.js output dir
    '**/out/**',
  ]),
  js.configs.recommended,
  github.recommended,
  ...github.typescript,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/array-type': 'off',
      'eslint-comments/no-unlimited-disable': 'off',
      'eslint-comments/no-use': 'off',
      'filenames/match-regex': 'off',
      'github/filenames-match-regex': 'off',
      'github/no-inner-html': 'off',
      'github/no-then': 'off',
      'github/role-supports-aria-props': 'off',
      'i18n-text/no-en': 'off',
      'import/extensions': 'off',
      'import/namespace': 'off',
      'import/no-commonjs': 'off',
      'import/no-dynamic-require': 'off',
      'import/no-namespace': 'off',
      'import/no-nodejs-modules': 'off',
      'import/no-unresolved': 'off',
      'no-console': 'off',
      'no-restricted-syntax': 'off',
      'no-shadow': 'off',
    },
  },
])

export default config
