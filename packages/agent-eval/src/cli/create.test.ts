import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {runCommand} from 'citty'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {getBenchmark} from '../benchmark/get'
import {getExperiment} from '../experiment/get'
import {getScenario} from '../scenario/get'
import {benchmark} from './commands/benchmark'
import {experiment} from './commands/experiment'
import {scenario} from './commands/scenario'

const generate = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', async () => {
  const {promisify} = await import('node:util')
  return {execFile: Object.assign(vi.fn(), {[promisify.custom]: generate})}
})

let directory: string

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-eval-create-'))
  await fs.symlink(path.resolve(import.meta.dirname, '../../../../node_modules'), path.join(directory, 'node_modules'))
  vi.spyOn(process, 'cwd').mockReturnValue(directory)
  generate.mockImplementation(async (command: string, args: Array<string>, options: {cwd: string}) => {
    if (command === 'npm') {
      const filepath = path.join(options.cwd, 'package.json')
      const packageJson = JSON.parse(await fs.readFile(filepath, 'utf8'))
      await fs.writeFile(filepath, JSON.stringify({...packageJson, type: 'module'}))
      return {stdout: '', stderr: ''}
    }
    await fs.writeFile(path.join(options.cwd, args[2], 'package.json'), JSON.stringify({name: args[2], private: true}))
    return {stdout: '', stderr: ''}
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.resetAllMocks()
  await fs.rm(directory, {recursive: true, force: true})
})

describe.each([
  {name: 'benchmark', command: benchmark, folder: 'benchmarks'},
  {name: 'experiment', command: experiment, folder: 'experiments'},
  {name: 'scenario', command: scenario, folder: 'scenarios'},
])('$name create', ({name, command, folder}) => {
  test.each([false, true])('creates a loadable configuration (custom directory: %s)', async custom => {
    const destination = path.join(directory, custom ? 'custom directory' : folder)
    const description = 'Evaluate "quoted" text\nwith `templates` and ${expressions}'
    await runCommand(command, {
      rawArgs: ['create', 'example', '--description', description, ...(custom ? [`--${folder}`, destination] : [])],
    })

    if (name === 'benchmark') {
      const config = await getBenchmark({
        benchmarksDirectory: destination,
        name: 'example',
        scenariosDirectory: directory,
      })
      expect(config).toMatchObject({
        name: 'example',
        description,
        models: [{name: 'gpt-5.5'}],
        capabilities: [{name: 'Example capability', scenarios: []}],
      })
    } else if (name === 'experiment') {
      const config = await getExperiment({
        experimentsDirectory: destination,
        name: 'example',
        scenariosDirectory: directory,
      })
      expect(config).toMatchObject({name: 'example', description, models: [{name: 'gpt-5.5'}], scenarios: []})
    } else {
      const config = await getScenario({directory: destination, name: 'example'})
      expect(config).toMatchObject({
        id: 'example',
        description,
        prompt: 'Describe the task the agent should complete.',
        checks: [],
        judges: [],
      })
    }
  })

  test('requires a name', async () => {
    await expect(runCommand(command, {rawArgs: ['create']})).rejects.toThrow()
    expect(generate).not.toHaveBeenCalled()
  })

  test.each([
    '',
    '../escape',
    '/absolute',
    'nested/name',
    'nested\\name',
    'with space',
    '$(command)',
    'Example',
    'x.ts',
  ])('rejects unsafe or invalid names: %j', async invalidName => {
    await expect(runCommand(command, {rawArgs: ['create', invalidName]})).rejects.toThrow()
    await expect(fs.stat(path.join(directory, folder))).rejects.toThrow()
    expect(generate).not.toHaveBeenCalled()
  })

  test('does not overwrite an existing destination', async () => {
    const parent = path.join(directory, folder)
    await fs.mkdir(parent)
    const destination = path.join(parent, name === 'scenario' ? 'example' : 'example.ts')
    await fs.writeFile(destination, 'keep this content')
    await expect(runCommand(command, {rawArgs: ['create', 'example']})).rejects.toThrow()
    expect(await fs.readFile(destination, 'utf8')).toBe('keep this content')
    expect(generate).not.toHaveBeenCalled()
  })

  test('does not overwrite a dangling symlink', async () => {
    const parent = path.join(directory, folder)
    await fs.mkdir(parent)
    const destination = path.join(parent, name === 'scenario' ? 'example' : 'example.ts')
    const target = path.join(directory, 'missing')
    await fs.symlink(target, destination)
    await expect(runCommand(command, {rawArgs: ['create', 'example']})).rejects.toThrow()
    expect(await fs.readlink(destination)).toBe(target)
    await expect(fs.stat(target)).rejects.toThrow()
    expect(generate).not.toHaveBeenCalled()
  })
})

test.each([
  {command: benchmark, folder: 'benchmarks'},
  {command: experiment, folder: 'experiments'},
])('$folder creation rejects the reserved index filename', async ({command, folder}) => {
  await expect(runCommand(command, {rawArgs: ['create', 'index']})).rejects.toThrow('reserved')
  await expect(fs.stat(path.join(directory, folder))).rejects.toThrow()
})

describe('scenario templates', () => {
  test.each([
    {template: undefined, generator: 'create-next-app@16.3.5', flags: ['--skip-install', '--disable-git', '--empty']},
    {template: 'nextjs', generator: 'create-next-app@16.3.5', flags: ['--skip-install', '--disable-git', '--empty']},
    {
      template: 'vite',
      generator: 'create-vite@9.2.1',
      flags: ['--template', 'react-ts', '--no-interactive', '--no-immediate'],
    },
  ])('scaffolds $template with the official generator', async ({template, generator, flags}) => {
    const prompt = 'Implement a "task list"\nwith `code` and ${text}'
    await runCommand(scenario, {
      rawArgs: ['create', '001-example', '--prompt', prompt, ...(template ? ['--template', template] : [])],
    })
    expect(generate).toHaveBeenCalledWith(
      'npx',
      expect.arrayContaining(['--yes', generator, '001-example', ...flags]),
      {cwd: path.join(directory, 'scenarios')},
    )
    expect(generate).toHaveBeenCalledWith('npm', ['pkg', 'set', 'type=module'], {
      cwd: path.join(directory, 'scenarios', '001-example'),
    })
    expect(
      JSON.parse(await fs.readFile(path.join(directory, 'scenarios', '001-example', 'package.json'), 'utf8')),
    ).toMatchObject({type: 'module'})
    const config = await getScenario({directory: path.join(directory, 'scenarios'), name: '001-example'})
    expect(config.prompt).toBe(prompt)
    expect(config.checks).toEqual([])
    expect(config.judges).toEqual([])
  })

  test.each(['unknown', ''])('rejects invalid template %j before creating files', async template => {
    await expect(runCommand(scenario, {rawArgs: ['create', 'example', '--template', template]})).rejects.toThrow()
    await expect(fs.stat(path.join(directory, 'scenarios'))).rejects.toThrow()
    expect(generate).not.toHaveBeenCalled()
  })

  test('preserves existing directories, even when empty', async () => {
    const destination = path.join(directory, 'scenarios', 'example')
    await fs.mkdir(destination, {recursive: true})
    await expect(runCommand(scenario, {rawArgs: ['create', 'example']})).rejects.toThrow()
    expect(await fs.readdir(destination)).toEqual([])
    expect(generate).not.toHaveBeenCalled()
  })

  test('removes partial scaffolding after a generator failure and permits retry', async () => {
    const failure = new Error('Generator failed')
    generate.mockImplementationOnce(async () => {
      await fs.writeFile(path.join(directory, 'scenarios', 'example', 'partial.txt'), 'partial')
      throw failure
    })
    await expect(runCommand(scenario, {rawArgs: ['create', 'example']})).rejects.toBe(failure)
    await expect(fs.stat(path.join(directory, 'scenarios', 'example'))).rejects.toThrow()
    await runCommand(scenario, {rawArgs: ['create', 'example']})
    expect(await getScenario({directory: path.join(directory, 'scenarios'), name: 'example'})).toMatchObject({
      id: 'example',
    })
  })
})
