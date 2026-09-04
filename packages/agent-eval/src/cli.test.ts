import {afterEach, describe, expect, test, vi} from 'vitest'

const originalArgv = process.argv
const originalToken = process.env.COPILOT_GITHUB_TOKEN

afterEach(() => {
  process.argv = originalArgv
  if (originalToken === undefined) {
    delete process.env.COPILOT_GITHUB_TOKEN
  } else {
    process.env.COPILOT_GITHUB_TOKEN = originalToken
  }
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('cli', () => {
  test('displays help when requested', async () => {
    process.argv = ['node', 'agent-eval', '--help']
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit')
    })

    await expect(import('./cli')).rejects.toThrow('process.exit')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Usage: agent-eval [options]'))
    expect(log).toHaveBeenCalledWith(expect.stringContaining('--output-dir <dir>'))
  })

  test('requires a Copilot token before running', async () => {
    process.argv = ['node', 'agent-eval']
    delete process.env.COPILOT_GITHUB_TOKEN

    await expect(import('./cli')).rejects.toThrow(
      'COPILOT_GITHUB_TOKEN environment variable is required to run agent-eval',
    )
  })

  test('displays help when no benchmark or experiment is selected', async () => {
    process.argv = ['node', 'agent-eval']
    process.env.COPILOT_GITHUB_TOKEN = 'token'
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    await import('./cli')

    expect(log).toHaveBeenCalledWith(expect.stringContaining('Usage: agent-eval [options]'))
  })

  test('rejects output directory combinations with explicit output paths', async () => {
    process.argv = ['node', 'agent-eval', '--output-dir', 'results/run', '--output', 'output.json']
    process.env.COPILOT_GITHUB_TOKEN = 'token'

    await expect(import('./cli')).rejects.toThrow('--output-dir cannot be combined with --output')
  })
})
