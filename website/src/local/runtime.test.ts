import {EventEmitter} from 'node:events'
import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import {afterEach, expect, onTestFinished, test, vi} from 'vitest'
import {runUi} from '../../runtime.js'

vi.mock('node:child_process', () => ({spawn: vi.fn()}))

afterEach(() => vi.restoreAllMocks())

async function fixture() {
  const root = path.resolve(`.website-runtime-test-${randomUUID()}`)
  const results = path.join(root, 'results')
  await fs.mkdir(results, {recursive: true})
  onTestFinished(() => fs.rm(root, {recursive: true, force: true}))
  return {results, outputDirectory: path.join(root, 'site')}
}

test('stages a standalone app and copies export files without modifying inputs', async () => {
  const options = await fixture()
  let workspace = ''
  vi.mocked(spawn).mockImplementation((_command, args, spawnOptions) => {
    workspace = String(spawnOptions!.cwd)
    const child = new EventEmitter()
    void (async () => {
      expect(args).toContain('--webpack')
      expect(spawnOptions!.env!.AGENT_EVAL_UI_RESULTS).toBe(options.results)
      expect(await fs.readlink(path.join(workspace, 'node_modules/next'))).toContain('next')
      const config = JSON.parse(await fs.readFile(path.join(workspace, 'tsconfig.json'), 'utf8'))
      expect(config.extends).toBeUndefined()
      const manifest = JSON.parse(await fs.readFile(path.join(workspace, 'package.json'), 'utf8'))
      expect(manifest.browserslist).toEqual(['defaults'])
      await fs.mkdir(path.join(workspace, 'out'))
      await fs.writeFile(path.join(workspace, 'out/index.html'), 'exported')
      child.emit('close', 0)
    })().catch(error => child.emit('error', error))
    return child as ReturnType<typeof spawn>
  })
  await runUi({mode: 'build', ...options})
  expect(await fs.readFile(path.join(options.outputDirectory, 'index.html'), 'utf8')).toBe('exported')
  expect(await fs.readFile(path.join(options.outputDirectory, '.nojekyll'), 'utf8')).toBe('')
  expect(await fs.readdir(options.results)).toEqual([])
  await expect(fs.stat(workspace)).rejects.toMatchObject({code: 'ENOENT'})
})

test.each(['exit', 'error'])('cleans the workspace when the child fails with %s', async failure => {
  const options = await fixture()
  let workspace = ''
  vi.mocked(spawn).mockImplementation((_command, _args, spawnOptions) => {
    workspace = String(spawnOptions!.cwd)
    const child = new EventEmitter()
    queueMicrotask(() => {
      if (failure === 'exit') child.emit('close', 1)
      else child.emit('error', new Error('Could not spawn Next'))
    })
    return child as ReturnType<typeof spawn>
  })
  await expect(runUi({mode: 'build', ...options})).rejects.toThrow()
  await expect(fs.stat(workspace)).rejects.toMatchObject({code: 'ENOENT'})
  await expect(fs.stat(options.outputDirectory)).rejects.toMatchObject({code: 'ENOENT'})
})

test('forwards termination, restores handlers, and cleans up a missing-results dev session', async () => {
  const options = await fixture()
  await fs.rm(options.results, {recursive: true})
  let workspace = ''
  const child = Object.assign(new EventEmitter(), {pid: 12345, kill: vi.fn()})
  const previousExitCode = process.exitCode
  const listeners = process.listenerCount('SIGTERM')
  onTestFinished(() => {
    process.exitCode = previousExitCode
  })
  const kill = vi.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
    queueMicrotask(() => child.emit('close', null, signal))
    return true
  })
  child.kill.mockImplementation(signal => {
    queueMicrotask(() => child.emit('close', null, signal))
    return true
  })
  vi.mocked(spawn).mockImplementation((_command, _args, spawnOptions) => {
    workspace = String(spawnOptions!.cwd)
    queueMicrotask(() => process.emit('SIGTERM'))
    return child as unknown as ReturnType<typeof spawn>
  })
  await runUi({mode: 'dev', results: options.results})
  expect(process.platform === 'win32' ? child.kill : kill).toHaveBeenCalled()
  expect(process.exitCode).toBe(143)
  expect(process.listenerCount('SIGTERM')).toBe(listeners)
  await expect(fs.stat(workspace)).rejects.toMatchObject({code: 'ENOENT'})
})
