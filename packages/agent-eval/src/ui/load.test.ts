import fs from 'node:fs/promises'
import {execFile} from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import {promisify} from 'node:util'
import {expect, onTestFinished, test, vi} from 'vitest'
import {runCommand} from 'citty'
import {runUi} from './load'
import packageJson from '../../package.json' with {type: 'json'}

async function createProject(source?: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-eval-ui-load-'))
  onTestFinished(async () => {
    await fs.rm(directory, {recursive: true, force: true})
  })
  if (source) {
    const ui = path.join(directory, 'node_modules/@primer/agent-eval-website')
    await fs.mkdir(ui, {recursive: true})
    await fs.writeFile(
      path.join(ui, 'package.json'),
      JSON.stringify({name: '@primer/agent-eval-website', type: 'module', exports: {'./runtime': './runtime.js'}}),
    )
    await fs.writeFile(path.join(ui, 'runtime.js'), source)
  }
  return directory
}

test('core has no dependency that installs the UI stack', () => {
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies'] as const) {
    const dependencies = (packageJson as Record<string, unknown>)[field] ?? {}
    for (const name of ['@primer/agent-eval-website', 'next', 'react', 'react-dom', '@primer/react']) {
      expect(dependencies).not.toHaveProperty(name)
    }
  }
})

test('missing opt-in package gives installation instructions', async () => {
  const directory = await createProject('export function runUi() {}')
  await fs.rm(path.join(directory, 'node_modules/@primer/agent-eval-website/runtime.js'))
  await expect(runUi({mode: 'dev', results: './results'}, directory)).rejects.toThrow(
    'npm install --save-dev @primer/agent-eval-website',
  )
})

test.each(['dev', 'build'] as const)('loads UI from the consumer project for %s', async mode => {
  const directory = await createProject(`
    import fs from 'node:fs/promises'
    export async function runUi(options) {
      await fs.writeFile(new URL('../../../options.json', import.meta.url), JSON.stringify(options))
    }
  `)
  await runUi({mode, results: './results', outputDirectory: './out', port: '4321', basePath: '/example'}, directory)
  expect(JSON.parse(await fs.readFile(path.join(directory, 'options.json'), 'utf8'))).toEqual({
    mode,
    results: path.join(directory, 'results'),
    outputDirectory: path.join(directory, 'out'),
    port: '4321',
    basePath: '/example',
  })
})

test('does not disguise errors from an installed UI as a missing package', async () => {
  const directory = await createProject("throw new Error('UI dependency could not be loaded')")
  await expect(runUi({mode: 'dev', results: './results'}, directory)).rejects.toThrow(
    'UI dependency could not be loaded',
  )
})

test('command parsing forwards options without eagerly loading the optional UI', async () => {
  const loader = await import('./load')
  const run = vi.spyOn(loader, 'runUi').mockResolvedValue()
  onTestFinished(() => {
    vi.restoreAllMocks()
  })
  const {ui} = await import('../cli/commands/ui')
  expect(run).not.toHaveBeenCalled()
  await runCommand(ui, {rawArgs: ['dev']})
  expect(run).toHaveBeenLastCalledWith({mode: 'dev', results: './results', port: '3000'})
  await runCommand(ui, {
    rawArgs: ['build', '--results', '/results', '--output-dir', '/site', '--base-path', '/repository'],
  })
  expect(run).toHaveBeenLastCalledWith({
    mode: 'build',
    results: '/results',
    outputDirectory: '/site',
    basePath: '/repository',
  })
})

test('runs without the workspace module search path and does not install missing UI dependencies', async () => {
  const directory = await createProject()
  const loader = new URL('./load.ts', import.meta.url).href
  await expect(
    promisify(execFile)(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `const {runUi} = await import(${JSON.stringify(loader)}); await runUi({mode: 'dev', results: './results'});`,
      ],
      {cwd: directory, env: {...process.env, NODE_PATH: ''}},
    ),
  ).rejects.toThrow('npm install --save-dev @primer/agent-eval-website')
  expect(await fs.readdir(directory)).toEqual([])
})
