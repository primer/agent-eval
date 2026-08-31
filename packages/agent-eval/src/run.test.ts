import {test, expect, vi} from 'vitest'
import {run, runTrial} from './run'
import {plan} from './plan'
import {VirtualHost} from './host'
import {VirtualSandbox} from './sandbox'

test('runTrial', async () => {
  const host = new VirtualHost({
    '/test': {
      'scenario.test.ts': '',
    },
  })
  await using sandbox = await VirtualSandbox.create({
    host,
  })

  sandbox.addCommandListener(async (cmd, args) => {
    if (cmd !== 'sh') {
      return
    }

    if (!Array.isArray(args)) {
      return
    }

    if (args[0] !== '-c' || !args[1].startsWith('npx vitest run')) {
      return
    }

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
  })

  const result = await runTrial(
    host,
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
})
