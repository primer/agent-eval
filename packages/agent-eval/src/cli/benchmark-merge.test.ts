import {runCommand} from 'citty'
import {afterEach, expect, test, vi} from 'vitest'
import {
  listBenchmarkOutputFiles,
  mergeBenchmarkOutputFiles,
  writeBenchmarkOutput,
  type BenchmarkOutput,
} from '../benchmark/output'
import {DefaultHost, VirtualHost} from '../host'
import {benchmark} from './commands/benchmark'

vi.mock('../benchmark/output', async importOriginal => {
  const original = await importOriginal<typeof import('../benchmark/output')>()
  return {
    ...original,
    listBenchmarkOutputFiles: vi.fn(),
    mergeBenchmarkOutputFiles: vi.fn(),
    writeBenchmarkOutput: vi.fn(),
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

test.each([false, true])('cleans up shard manifests only after a successful write (failure: %s)', async failure => {
  const host = VirtualHost.create({
    '/output/output-1.json': 'first shard',
    '/output/output-2.json': 'second shard',
  })
  const file = {id: 'example', capabilities: {}, scenarios: {}, treatments: {}, trials: {}}
  const output: BenchmarkOutput = {
    id: 'example',
    capabilities: new Map(),
    scenarios: new Map(),
    treatments: new Map(),
    trials: new Map(),
  }
  vi.mocked(listBenchmarkOutputFiles).mockResolvedValue([
    [file, '/output/output-1.json'],
    [file, '/output/output-2.json'],
  ])
  vi.mocked(mergeBenchmarkOutputFiles).mockResolvedValue(output)
  const error = new Error('Unable to write merged output')
  vi.mocked(writeBenchmarkOutput).mockImplementation(async () => {
    expect(host.existsSync('/output/output-1.json')).toBe(true)
    expect(host.existsSync('/output/output-2.json')).toBe(true)
    if (failure) {
      throw error
    }
  })
  const unlink = vi.spyOn(DefaultHost.fs, 'unlink').mockImplementation(host.fs.unlink)
  const command = runCommand(benchmark, {rawArgs: ['merge', '--output-dir', '/output']})

  if (failure) {
    await expect(command).rejects.toBe(error)
    expect(unlink).not.toHaveBeenCalled()
  } else {
    await command
    expect(unlink).toHaveBeenCalledTimes(2)
  }
  expect(writeBenchmarkOutput).toHaveBeenCalledExactlyOnceWith({output, outputPath: '/output/output.json'})
  expect(host.existsSync('/output/output-1.json')).toBe(failure)
  expect(host.existsSync('/output/output-2.json')).toBe(failure)
})
