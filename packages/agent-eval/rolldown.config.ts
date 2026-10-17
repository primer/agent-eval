import fs from 'node:fs/promises'
import path from 'node:path'
import {globSync} from 'glob'
import {defineConfig} from 'rolldown/config'
import {dts} from 'rolldown-plugin-dts'
import ts from 'typescript'
import packageJson from './package.json' with {type: 'json'}

const dependencies = [...Object.keys(packageJson.dependencies), ...Object.keys(packageJson.devDependencies)]
const external = dependencies.map(name => {
  return new RegExp(`^${name}(/.*)?`)
})

const uiDirectory = path.join(import.meta.dirname, 'src', 'ui')
const uiFiles = globSync(['app/**/*.{ts,tsx}', 'env.ts', 'next.config.ts'], {
  cwd: uiDirectory,
  ignore: ['**/*.test.{ts,tsx}'],
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
        },
        async generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: '.npmignore',
            source: '**/.next/**\n',
          })
          await Promise.all(
            uiFiles.map(async filename => {
              const source = await fs.readFile(path.join(uiDirectory, filename), 'utf8')
              // Next requires route configuration exports to remain declarations, not export lists.
              const {outputText, diagnostics} = ts.transpileModule(source, {
                fileName: filename,
                reportDiagnostics: true,
                compilerOptions: {
                  target: ts.ScriptTarget.ESNext,
                  module: ts.ModuleKind.ESNext,
                  jsx: ts.JsxEmit.ReactJSX,
                  verbatimModuleSyntax: true,
                },
              })
              for (const diagnostic of diagnostics ?? []) {
                if (diagnostic.category === ts.DiagnosticCategory.Error) {
                  this.error(`${filename}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`)
                }
              }
              this.emitFile({
                type: 'asset',
                fileName: `ui/${filename.replace(/\.tsx?$/, '.js')}`,
                source: outputText,
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
