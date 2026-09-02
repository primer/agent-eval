import {test, vi} from 'vitest'
import type {ResultMessage} from './copilot-cli'
import {run, type Trial} from './trial'
import {COPILOT_DIR, AGENTS_DIR} from './sandbox'
import {VirtualHost} from './host'
import {randomUUID} from 'node:crypto'

test('run', async () => {
  const host = VirtualHost.create({
    [AGENTS_DIR]: {},
    [COPILOT_DIR]: {},
    '/scenarios/test': {
      'scenario.config.ts': '',
      'scenario.test.ts': '',
    },
  })
  await using sandbox = await host.createSandbox()

  const runCommand = sandbox.runCommand

  vi.spyOn(sandbox, 'runCommand').mockImplementation(async (command, args, options) => {
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

    if (command === 'copilot') {
      const result: ResultMessage = {
        type: 'result',
        timestamp: '',
        sessionId: '',
        exitCode: 0,
        usage: {
          premiumRequests: 0,
          totalApiDurationMs: 0,
          sessionDurationMs: 0,
          codeChanges: {
            linesAdded: 0,
            linesRemoved: 0,
            filesModified: [],
          },
        },
      }
      return {
        stdout: [JSON.stringify(result)].join('\n'),
        stderr: '',
        exitCode: 0,
      }
    }

    return runCommand(command, args, options)
  })

  const trial: Trial = {
    id: randomUUID(),
    scenario: {
      id: 'test-id',
      directory: '/scenarios/test',
      prompt: 'test-prompt',
      tags: [],
      testPath: '/scenarios/test/scenario.test.ts',
    },
    treatment: {
      name: 'test-treatment-name',
    },
    model: {
      name: 'gpt-5.6-sol',
      reasoningEffort: 'medium',
    },
  }

  const result = await run({
    artifactsDirectory: '/artifacts',
    copilotToken: 'test',
    host,
    sandbox,
    trial,
  })

  // vi.spyOn(sandbox, 'copy').mockResolvedValue()
  // const runCommand = vi.spyOn(sandbox, 'runCommand').mockImplementation(async command => {
  //   if (command === 'sh') {
  //     await sandbox.writeFile(
  //       'test-results.json',
  //       JSON.stringify({
  //         numTotalTests: 0,
  //         numPassedTests: 0,
  //         numFailedTests: 0,
  //         numPendingTests: 0,
  //         numTodoTests: 0,
  //         success: true,
  //         testResults: [],
  //       }),
  //     )
  //   }
  //
  //   return {
  //     stdout: '',
  //     stderr: '',
  //     exitCode: 0,
  //   }
  // })
  //
  // const result = await runTrial(
  //   sandbox,
  //   {
  //     id: 'test',
  //     scenario: {
  //       id: 'test',
  //       directory: '/test',
  //       prompt: 'test',
  //       tags: [],
  //       testPath: '/test/scenario.test.ts',
  //     },
  //     treatment: {
  //       name: 'test',
  //     },
  //     model: {
  //       name: 'gpt-5.6-sol',
  //       reasoningEffort: 'medium',
  //     },
  //   },
  //   {
  //     artifactsDirectory: '',
  //     copilotToken: '',
  //   },
  // )
  //
  // expect(runCommand).toHaveBeenCalledWith(
  //   'copilot',
  //   ['--prompt', 'test', '--model', 'gpt-5.6-sol', '--reasoning-effort', 'medium'],
  //   {
  //     user: NODE_USER,
  //     env: {
  //       COPILOT_GITHUB_TOKEN: '',
  //     },
  //   },
  // )
  // expect(result.assistant.sessions).toEqual([[]])
})
