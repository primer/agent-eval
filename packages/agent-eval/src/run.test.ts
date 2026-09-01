import {expect, test, vi} from 'vitest'
import {runTrial} from './run'
import {NODE_USER, VirtualSandbox} from './sandbox'

test('runTrial', async () => {
  await using sandbox = await VirtualSandbox.create()
  vi.spyOn(sandbox, 'copy').mockResolvedValue()
  const runCommand = vi.spyOn(sandbox, 'runCommand').mockImplementation(async command => {
    if (command === 'sh') {
      await sandbox.writeFile(
        'test-results.json',
        JSON.stringify({
          numTotalTests: 0,
          numPassedTests: 0,
          numFailedTests: 0,
          numPendingTests: 0,
          numTodoTests: 0,
          success: true,
          testResults: [],
        }),
      )
    }

    return {
      stdout: '',
      stderr: '',
      exitCode: 0,
    }
  })

  const result = await runTrial(
    sandbox,
    {
      id: 'test',
      scenario: {
        id: 'test',
        directory: '/test',
        prompt: 'test',
        tags: [],
        testPath: '/test/scenario.test.ts',
      },
      treatment: {
        name: 'test',
      },
      model: {
        name: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
      },
    },
    {
      artifactsDirectory: '',
      copilotToken: '',
    },
  )

  expect(runCommand).toHaveBeenCalledWith(
    'copilot',
    ['--prompt', 'test', '--model', 'gpt-5.6-sol', '--reasoning-effort', 'medium'],
    {
      user: NODE_USER,
      env: {
        COPILOT_GITHUB_TOKEN: '',
      },
    },
  )
  expect(result.assistant.sessions).toEqual([[]])
})
