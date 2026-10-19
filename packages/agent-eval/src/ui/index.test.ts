import {ChildProcess, spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import path from 'node:path'
import {afterEach, describe, expect, test, vi} from 'vitest'
import {build, serve} from './index'

vi.mock('node:child_process', async importOriginal => {
  const original = await importOriginal<typeof import('node:child_process')>()
  return {
    ...original,
    spawn: vi.fn(),
  }
})

const require = createRequire(import.meta.url)
const nextBin = require.resolve('next/dist/bin/next')

afterEach(() => {
  vi.clearAllMocks()
})

describe('serve', () => {
  test('binds to loopback and preserves the project working directory', async () => {
    const child = new ChildProcess()
    vi.mocked(spawn).mockReturnValueOnce(child)
    const directory = path.resolve('/package/dist/ui')

    const serving = serve({
      directory,
      benchmarksDirectory: '/project/benchmarks',
      experimentsDirectory: '/project/experiments',
      scenariosDirectory: '/project/scenarios',
    })
    child.emit('exit', 0, null)
    await serving

    expect(vi.mocked(spawn).mock.calls).toEqual([
      [
        process.execPath,
        [nextBin, 'dev', directory, '--hostname', '127.0.0.1'],
        {
          stdio: 'inherit',
          env: expect.objectContaining({
            AGENT_EVAL_UI_BENCHMARKS_DIRECTORY: '/project/benchmarks',
            AGENT_EVAL_UI_EXPERIMENTS_DIRECTORY: '/project/experiments',
            AGENT_EVAL_UI_SCENARIOS_DIRECTORY: '/project/scenarios',
          }),
        },
      ],
    ])
  })
})

describe('build', () => {
  test('preserves the project working directory while exporting the packaged app', async () => {
    const child = new ChildProcess()
    vi.mocked(spawn).mockReturnValueOnce(child)
    const directory = path.resolve('/package/dist/ui')
    const outputDirectory = path.resolve('/project/out')

    const building = build({
      directory,
      basePath: '/evaluation',
      outputDirectory,
      benchmarksDirectory: '/project/benchmarks',
      experimentsDirectory: '/project/experiments',
      scenariosDirectory: '/project/scenarios',
    })
    child.emit('exit', 0, null)
    await building

    expect(vi.mocked(spawn).mock.calls).toEqual([
      [
        process.execPath,
        [nextBin, 'build', directory],
        {
          stdio: 'inherit',
          env: expect.objectContaining({
            AGENT_EVAL_UI_BASE_PATH: '/evaluation',
            AGENT_EVAL_UI_BENCHMARKS_DIRECTORY: '/project/benchmarks',
            AGENT_EVAL_UI_EXPERIMENTS_DIRECTORY: '/project/experiments',
            AGENT_EVAL_UI_OUTPUT: 'export',
            AGENT_EVAL_UI_OUTPUT_DIRECTORY: path.relative(directory, outputDirectory),
            AGENT_EVAL_UI_SCENARIOS_DIRECTORY: '/project/scenarios',
          }),
        },
      ],
    ])
  })
})
