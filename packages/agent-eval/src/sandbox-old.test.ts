import {describe, expect, test, vi} from 'vitest'
import {Sandbox} from './sandbox'

function createSandbox() {
  const sandbox = new Sandbox({} as never, {} as never)
  const copy = vi.spyOn(sandbox, 'copy').mockResolvedValue()
  const runCommand = vi.spyOn(sandbox, 'runCommand').mockResolvedValue({
    stdout: '',
    stderr: '',
    exitCode: 0,
  })

  return {sandbox, copy, runCommand}
}

describe('addCopilotPlugin', () => {
  test('installs a remote plugin', async () => {
    const {sandbox, copy, runCommand} = createSandbox()

    await sandbox.addCopilotPlugin({
      type: 'remote',
      url: 'https://github.com/example/plugin.git',
    })

    expect(copy).not.toHaveBeenCalled()
    expect(runCommand).toHaveBeenCalledOnce()
    expect(runCommand).toHaveBeenCalledWith('copilot', ['plugin', 'install', 'https://github.com/example/plugin.git'])
  })

  test('installs a versioned remote plugin', async () => {
    const {sandbox, copy, runCommand} = createSandbox()

    await sandbox.addCopilotPlugin({
      type: 'remote',
      url: 'https://github.com/example/plugin.git',
      version: 'v1.2.3',
    })

    expect(copy).not.toHaveBeenCalled()
    expect(runCommand).toHaveBeenCalledOnce()
    expect(runCommand).toHaveBeenCalledWith('copilot', [
      'plugin',
      'install',
      'https://github.com/example/plugin.git#v1.2.3',
    ])
  })

  test('copies and installs a local plugin', async () => {
    const {sandbox, copy, runCommand} = createSandbox()

    await sandbox.addCopilotPlugin({
      type: 'local',
      sourcePath: './plugins/local-plugin',
    })

    expect(copy).toHaveBeenCalledOnce()
    const pluginPath = copy.mock.calls[0][1]
    expect(pluginPath).toMatch(/^\/home\/node\/\.copilot\/plugin-sources\//)
    expect(copy).toHaveBeenCalledWith('./plugins/local-plugin', pluginPath)
    expect(runCommand).toHaveBeenCalledOnce()
    expect(runCommand).toHaveBeenCalledWith('copilot', ['plugin', 'install', pluginPath])
  })

  test('adds a remote marketplace and installs its plugin', async () => {
    const {sandbox, copy, runCommand} = createSandbox()

    await sandbox.addCopilotPlugin({
      type: 'marketplace',
      name: 'example-plugin',
      marketplace: {
        name: 'example-marketplace',
        source: {
          type: 'remote',
          url: 'https://github.com/example/marketplace.git',
          version: 'v1.2.3',
        },
      },
    })

    expect(copy).not.toHaveBeenCalled()
    expect(runCommand).toHaveBeenNthCalledWith(1, 'copilot', [
      'plugin',
      'marketplace',
      'add',
      'https://github.com/example/marketplace.git#v1.2.3',
    ])
    expect(runCommand).toHaveBeenNthCalledWith(2, 'copilot', [
      'plugin',
      'install',
      'example-plugin@example-marketplace',
    ])
  })

  test('copies a local marketplace and installs its plugin', async () => {
    const {sandbox, copy, runCommand} = createSandbox()

    await sandbox.addCopilotPlugin({
      type: 'marketplace',
      name: 'example-plugin',
      marketplace: {
        name: 'example-marketplace',
        source: {
          type: 'local',
          sourcePath: './plugins/marketplace',
        },
      },
    })

    const marketplacePath = copy.mock.calls[0][1]
    expect(marketplacePath).toMatch(/^\/home\/node\/\.copilot\/plugin-sources\//)
    expect(copy).toHaveBeenCalledWith('./plugins/marketplace', marketplacePath)
    expect(runCommand).toHaveBeenNthCalledWith(1, 'copilot', ['plugin', 'marketplace', 'add', marketplacePath])
    expect(runCommand).toHaveBeenNthCalledWith(2, 'copilot', [
      'plugin',
      'install',
      'example-plugin@example-marketplace',
    ])
  })
})
