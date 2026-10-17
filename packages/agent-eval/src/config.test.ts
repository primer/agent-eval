import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import {expect, test} from 'vitest'

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
])('$name defineConfig emits portable consumer declarations', async ({entrypoint, config}) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-eval-config-'))
  try {
    await fs.writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({type: 'module', dependencies: {'@primer/agent-eval': '*'}}),
    )
    const modules = path.join(directory, 'node_modules', '@primer')
    await fs.mkdir(modules, {recursive: true})
    await fs.symlink(path.resolve(import.meta.dirname, '..'), path.join(modules, 'agent-eval'), 'dir')
    const filename = path.join(directory, 'config.ts')
    await fs.writeFile(
      filename,
      `import {defineConfig} from '@primer/agent-eval/${entrypoint}'
       export default defineConfig(${config})`,
    )
    const program = ts.createProgram([filename], {
      strict: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      declaration: true,
      emitDeclarationOnly: true,
      skipLibCheck: true,
      types: [],
    })
    const declarations: Array<string> = []

    const result = program.emit(undefined, (_filename, text) => declarations.push(text))
    const diagnostics = [...ts.getPreEmitDiagnostics(program), ...result.diagnostics]

    expect(diagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))).toEqual([])
    expect(result.emitSkipped).toBe(false)
    expect(declarations).toHaveLength(1)
    expect(declarations[0]).not.toMatch(/\.pnpm|node_modules|zod/)
  } finally {
    await fs.rm(directory, {recursive: true, force: true})
  }
})
