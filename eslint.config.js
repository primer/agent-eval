import js from '@eslint/js'
import {defineConfig, globalIgnores} from 'eslint/config'
import githubPlugin from 'eslint-plugin-github'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const github = githubPlugin.getFlatConfigs()

/**
 * @type {import('@eslint/js').FlatConfig}
 */
const config = defineConfig([
  globalIgnores(['**/node_modules/**', '**/.next/**', '**/dist/**']),
  tseslint.configs.recommended,
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
      'no-shadow': 'off',
      'filenames/match-regex': 'off',
      'import/extensions': 'off',
      'import/namespace': 'off',
      'import/no-commonjs': 'off',
      'import/no-nodejs-modules': 'off',
      'import/no-dynamic-require': 'off',
      'import/no-unresolved': 'off',
      'i18n-text/no-en': 'off',
      'github/filenames-match-regex': 'off',
      'github/no-inner-html': 'off',
      'github/role-supports-aria-props': 'off',
      'no-restricted-syntax': 'off',
    },
  },
])

export default config
