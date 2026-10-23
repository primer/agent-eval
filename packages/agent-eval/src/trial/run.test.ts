import Queue from 'p-queue'
import {expect, test, vi} from 'vitest'
import {VirtualHost} from '../host'
import {AGENTS_DIR, COPILOT_DIR, VirtualSandbox, type Sandbox} from '../sandbox'
import {ControlTreatment} from '../treatment'
import {RunTrialResultSchema, runTrial} from './run'
import type {Trial} from './trial'

test.each([
  {runner: 'copilot-cli', status: 'passed'},
  {runner: 'copilot-sdk', status: 'passed'},
  {runner: 'copilot-cli', status: 'failed'},
  {runner: 'copilot-cli', status: 'error'},
] as const)(
  'withholds check files and preserves a $status check result (runner: $runner)',
  async ({runner, status}) => {
    const host = VirtualHost.create({
      '/scenarios/example/package.json': '{}',
      '/scenarios/example/scenario.config.ts': '',
      '/scenarios/example/scenario.test.ts': 'legacy test',
      '/scenarios/example/vitest.config.scenario.ts': 'private check config',
      '/scenarios/example/checks/reference.json': 'private reference',
      '/home/sandbox/workspace/src/reference.json': 'ordinary source',
      [`${COPILOT_DIR}/config.json`]: '{}',
      [`${AGENTS_DIR}/config.json`]: '{}',
    })
    await using sandbox: Sandbox = await VirtualSandbox.create({host})
    const checkRun = vi.fn<Trial['scenario']['checks'][number]['run']>(async ({sandbox: checkSandbox}) => {
      await expect(checkSandbox.readFile('vitest.config.scenario.ts')).resolves.toBe('private check config')
      await expect(checkSandbox.readFile('checks/reference.json')).resolves.toBe('private reference')
      await expect(checkSandbox.readFile('src/reference.json')).resolves.toBe('ordinary source')
      if (status === 'error') {
        throw new Error('Verification failed')
      }
      return [{type: 'outcomes', outcomes: [{type: 'outcome', status, annotations: []}]}]
    })
    const trial: Trial = {
      id: 'trial',
      model: {name: 'gpt-5.5', reasoningEffort: 'high'},
      runner,
      treatment: ControlTreatment,
      scenario: {
        id: 'example',
        directory: '/scenarios/example',
        prompt: 'Update the example',
        tags: [],
        judges: [],
        image: {type: 'Default'},
        checks: [
          {
            name: 'custom-check',
            files: [
              {
                filepath: '/scenarios/example/vitest.config.scenario.ts',
                relativePath: 'vitest.config.scenario.ts',
              },
              {
                filepath: '/scenarios/example/checks/reference.json',
                relativePath: 'checks/reference.json',
              },
            ],
            run: checkRun,
          },
        ],
      },
    }
    let taskCalls = 0
    const copilotQueue = new Queue({concurrency: 1})
    vi.spyOn(sandbox, 'runCommand').mockImplementation(async (command, args = []) => {
      if (
        (command === '/opt/agent-eval/copilot/bin/copilot' && args.includes(trial.scenario.prompt)) ||
        (command === '/opt/agent-eval/node/bin/node' && args[0] === '/opt/agent-eval/sdk-runner/run.cjs')
      ) {
        taskCalls++
        expect(copilotQueue.pending).toBe(1)
        expect(command).toBe(
          runner === 'copilot-sdk' ? '/opt/agent-eval/node/bin/node' : '/opt/agent-eval/copilot/bin/copilot',
        )
        if (runner === 'copilot-sdk') {
          expect(JSON.parse(await sandbox.readFile(args[1]))).toMatchObject({
            model: trial.model.name,
            reasoningEffort: trial.model.reasoningEffort,
            prompt: trial.scenario.prompt,
          })
        } else {
          const usagePath = args[args.indexOf('--usage-output-file') + 1]
          await sandbox.writeFile(usagePath, JSON.stringify({modelMetrics: {'gpt-5.5': {usage: {outputTokens: 42}}}}))
        }
        await expect(sandbox.exists('vitest.config.scenario.ts')).resolves.toBe(false)
        await expect(sandbox.exists('checks/reference.json')).resolves.toBe(false)
        await expect(sandbox.exists('scenario.test.ts')).resolves.toBe(false)
        await expect(sandbox.readFile('src/reference.json')).resolves.toBe('ordinary source')
      }
      return {
        exitCode: 0,
        stderr: '',
        stdout:
          command === '/opt/agent-eval/copilot/bin/copilot' || command === '/opt/agent-eval/node/bin/node'
            ? JSON.stringify({
                type: 'result',
                timestamp: '2026-09-15T00:00:00.000Z',
                sessionId: 'session',
                exitCode: 0,
                usage: {
                  premiumRequests: 0,
                  totalApiDurationMs: 0,
                  sessionDurationMs: 0,
                  codeChanges: {linesAdded: 0, linesRemoved: 0, filesModified: []},
                },
              })
            : '',
      }
    })

    const result = await runTrial({
      artifactsDirectory: '/artifacts',
      copilotQueue,
      copilotToken: 'test-token',
      host,
      sandbox,
      trial,
    })

    expect(taskCalls).toBe(1)
    expect(checkRun).toHaveBeenCalledOnce()
    if (status === 'error') {
      expect(result).toMatchObject({
        type: 'error',
        error: {
          name: 'Error',
          message: 'Verification failed',
        },
      })
      expect(result).not.toHaveProperty('checks')
      return
    }
    expect(result.type).toBe('success')
    if (result.type !== 'success') {
      throw new Error(result.error.message)
    }
    expect(result.agent.sessions[0].outputTokens).toBe(runner === 'copilot-cli' ? 42 : 0)
    expect(sandbox.runCommand).toHaveBeenCalledWith(
      'npm',
      ['install', '-g', '--prefix', '/home/node/.npm-global', '--allow-scripts=agent-browser', 'agent-browser'],
      {user: '1000:1000'},
    )
    expect(result.checks[0]?.result).toEqual({
      type: 'outcomes',
      outcomes: [{type: 'outcome', status, annotations: []}],
    })
  },
)

test.each([
  {name: 'an Error with a stack', thrown: new TypeError('Setup failed')},
  {name: 'a non-Error rejection', thrown: 'Setup failed'},
])('returns a serializable failure for $name without starting the agent', async ({thrown}) => {
  const host = VirtualHost.create()
  await using sandbox = await VirtualSandbox.create({host})
  const runCommand = vi.spyOn(sandbox, 'runCommand')
  const trial: Trial = {
    id: 'failed-trial',
    runner: 'copilot-cli',
    model: {name: 'gpt-5.5', reasoningEffort: 'high'},
    treatment: ControlTreatment,
    scenario: {
      id: 'example',
      directory: '/scenarios/example',
      prompt: 'Update the example',
      tags: [],
      checks: [],
      judges: [],
      image: {type: 'Default'},
      async setup() {
        throw thrown
      },
    },
  }

  const result = await runTrial({
    artifactsDirectory: '/artifacts',
    copilotQueue: new Queue({concurrency: 1}),
    copilotToken: 'test-token',
    host,
    sandbox,
    trial,
  })

  expect(result).toEqual({
    type: 'error',
    error: {
      name: thrown instanceof Error ? 'TypeError' : 'Error',
      message: 'Setup failed',
      stack: thrown instanceof Error ? thrown.stack : undefined,
    },
  })
  expect(RunTrialResultSchema.parse(JSON.parse(JSON.stringify(result)))).toMatchObject({
    type: 'error',
    error: {message: 'Setup failed'},
  })
  expect(runCommand).not.toHaveBeenCalled()
})
