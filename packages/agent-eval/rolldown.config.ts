import fs from 'node:fs/promises'
import path from 'node:path'
import {globSync} from 'glob'
import {defineConfig} from 'rolldown/config'
import {transformSync} from 'rolldown/utils'
import {dts} from 'rolldown-plugin-dts'
import packageJson from './package.json' with {type: 'json'}

const dependencies = [...Object.keys(packageJson.dependencies), ...Object.keys(packageJson.devDependencies)]
const external = dependencies.map(name => {
  return new RegExp(`^${name}(/.*)?`)
})

const uiDirectory = path.join(import.meta.dirname, 'src', 'ui')
const uiFiles = globSync(['app/**/*.{ts,tsx}', 'agent-eval.ts', 'env.ts', 'next.config.ts', 'postcss.config.ts'], {
  cwd: uiDirectory,
  ignore: ['**/*.test.{ts,tsx}', '**/.next/**'],
  posix: true,
})
const cssFiles = globSync(['app/**/*.css'], {
  cwd: uiDirectory,
  ignore: ['**/*.test.{ts,tsx}', '**/.next/**'],
  posix: true,
})

const config = defineConfig([
  {
    input: {
      benchmark: 'src/benchmark.ts',
      cli: 'src/cli.ts',
      experiment: 'src/experiment.ts',
      index: 'src/index.ts',
      scenario: 'src/scenario.ts',
    },
    platform: 'node',
    external,
    plugins: [
      dts({eager: true, sourcemap: true}),
      {
        name: 'compile-ui',
        buildStart() {
          for (const filename of uiFiles) {
            this.addWatchFile(path.join(uiDirectory, filename))
          }

          for (const filename of cssFiles) {
            this.addWatchFile(path.join(uiDirectory, filename))
          }
        },
        async generateBundle() {
          await Promise.all(
            uiFiles.map(async filename => {
              const source = await fs.readFile(path.join(uiDirectory, filename), 'utf8')
              // Next requires route configuration exports to remain declarations, not export lists.
              const {code, errors, warnings} = transformSync(path.join(uiDirectory, filename), source, {
                target: 'esnext',
                jsx: {
                  runtime: 'automatic',
                },
              })
              for (const error of errors) {
                this.error(error)
              }
              for (const warning of warnings) {
                this.warn(warning)
              }
              const {dir, name} = path.posix.parse(filename)
              this.emitFile({
                type: 'asset',
                fileName: path.posix.format({
                  dir: path.posix.join('ui', dir),
                  name,
                  ext: '.js',
                }),
                source: code,
              })
            }),
          )

          await Promise.all(
            cssFiles.map(async filename => {
              const source = await fs.readFile(path.join(uiDirectory, filename), 'utf8')
              const {dir, name} = path.posix.parse(filename)
              this.emitFile({
                type: 'asset',
                fileName: path.posix.format({
                  dir: path.posix.join('ui', dir),
                  name,
                  ext: '.css',
                }),
                source,
              })
            }),
          )
        },
      },
    ],
    output: {
      dir: 'dist',
      preserveModules: true,
      preserveModulesRoot: 'src',
    },
  },
  {
    input: 'src/sandbox/glob-script.ts',
    platform: 'node',
    output: {
      file: 'dist/sandbox/glob-script.mjs',
      format: 'esm',
    },
  },
])

export default config
