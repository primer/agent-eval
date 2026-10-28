import path from 'node:path'
import ts from 'typescript'
import {expect, test} from 'vitest'
import {VirtualHost} from './host'

test.each([
  {
    entrypoint: 'benchmark',
    name: 'benchmark',
    config: `{
      name: 'Example',
      description: 'Example benchmark',
      models: ['gpt-5.4'],
      async setup({sandbox}) {
        await sandbox.writeFile('setup.txt', 'ready')
      },
      capabilities: [{
        name: 'Example',
        scenarios: ['example'],
        async setup({sandbox}) {
          await sandbox.readFile('setup.txt')
        },
      }],
    }`,
  },
  {
    entrypoint: 'experiment',
    name: 'scenario experiment',
    config: `{
      name: 'Example',
      description: 'Example experiment',
      models: ['gpt-5.4'],
      scenarios: ['example'],
      treatments: [{
        name: 'Example',
        async setup({sandbox}) {
          await sandbox.writeFile('setup.txt', 'ready')
        },
      }],
    }`,
  },
  {
    entrypoint: 'experiment',
    name: 'benchmark experiment',
    config: `{
      name: 'Example',
      description: 'Example benchmark experiment',
      models: ['gpt-5.4'],
      benchmark: 'example',
      setup({sandbox}) {
        void sandbox.readFile('setup.txt')
      },
      treatments: [],
    }`,
  },
  {
    entrypoint: 'scenario',
    name: 'scenario',
    config: `{
      prompt: 'Create a page',
      async setup({sandbox}) {
        await sandbox.writeFile('setup.txt', 'ready')
      },
      checks: [{
        name: 'Example',
        async run({sandbox, logger}) {
          logger.info(await sandbox.readFile('setup.txt'))
          return {outcomes: [{type: 'outcome', status: 'passed'}]}
        },
      }],
    }`,
  },
])('$name defineConfig emits portable consumer declarations', ({entrypoint, config}) => {
  const directory = path.resolve(import.meta.dirname, '../consumer')
  const filename = path.join(directory, 'config.ts')
  const packageDirectory = path.resolve(import.meta.dirname, '..')
  const packageLink = path.join(directory, 'node_modules/@primer/agent-eval')
  const host = VirtualHost.create({
    [path.join(directory, 'package.json')]: JSON.stringify({
      type: 'module',
      dependencies: {
        '@primer/agent-eval': '*',
      },
    }),
    [filename]: `import {defineConfig} from '@primer/agent-eval/${entrypoint}'
      export default defineConfig(${config})`,
  })
  host.fs.mkdirSync(path.dirname(packageLink), {
    recursive: true,
  })
  host.fs.symlinkSync(packageDirectory, packageLink, 'dir')

  const options: ts.CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    declaration: true,
    emitDeclarationOnly: true,
    skipLibCheck: true,
    types: [],
  }
  const systemHost = ts.createCompilerHost(options)
  function realpath(filepath: string) {
    if (filepath === packageLink || filepath.startsWith(`${packageLink}${path.sep}`)) {
      return ts.sys.realpath!(path.join(packageDirectory, path.relative(packageLink, filepath)))
    }
    if (host.fs.existsSync(filepath)) {
      return host.fs.realpathSync(filepath) as string
    }
    return ts.sys.realpath!(filepath)
  }
  const compilerHost: ts.CompilerHost = {
    ...systemHost,
    fileExists(filepath) {
      return host.fs.existsSync(filepath) || systemHost.fileExists(realpath(filepath))
    },
    directoryExists(filepath) {
      if (host.fs.existsSync(filepath)) {
        return host.fs.statSync(filepath).isDirectory()
      }
      return systemHost.directoryExists!(realpath(filepath))
    },
    readFile(filepath) {
      if (host.fs.existsSync(filepath) && host.fs.statSync(filepath).isFile()) {
        return host.fs.readFileSync(filepath, 'utf8') as string
      }
      return systemHost.readFile(realpath(filepath))
    },
    realpath,
    getSourceFile(filepath, languageVersion) {
      const contents = this.readFile(filepath)
      if (contents === undefined) {
        return undefined
      }
      return ts.createSourceFile(filepath, contents, languageVersion)
    },
  }
  const program = ts.createProgram([filename], options, compilerHost)
  const declarations: Array<string> = []

  const result = program.emit(undefined, (_filename, text) => {
    declarations.push(text)
  })
  const diagnostics = [...ts.getPreEmitDiagnostics(program), ...result.diagnostics]

  expect(
    diagnostics.map(diagnostic => {
      return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
    }),
  ).toEqual([])
  expect(result.emitSkipped).toBe(false)
  expect(program.getSourceFile(path.join(packageDirectory, 'dist', `${entrypoint}.d.ts`))).toBeDefined()
  expect(declarations).toHaveLength(1)
  expect(declarations[0]).not.toMatch(/\.pnpm|node_modules|zod/)
})
