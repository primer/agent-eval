import {test, expect, vi} from 'vitest'
import {run, runTrial} from './run'
import {plan} from './plan'
import {VirtualHost} from './host'
import {VirtualSandbox} from './sandbox'

test('hello', async () => {
  const host = VirtualHost.create()
  const sandbox = await VirtualSandbox.create({
    host,
  })
  const results = await run(host, sandbox, await plan([]), {
    artifactsDirectory: 'test',
    copilotToken: 'test',
    maxConcurrency: 1,
  })
})

test('runTrial', async () => {
  const host = new VirtualHost()
  const sandbox = await VirtualSandbox.create({
    host,
  })
  const result = await runTrial(
    host,
    sandbox,
    {
      id: 'test',
      scenario: {
        id: 'test',
        directory: 'test',
        prompt: 'test',
        tags: [],
        testPath: 'test',
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
