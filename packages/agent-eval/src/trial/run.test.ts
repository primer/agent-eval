import Queue from 'p-queue'
import {expect, test, vi} from 'vitest'
import {VirtualHost} from '../host'
import {AGENTS_DIR, CONTAINER_WORKDIR, COPILOT_DIR, VirtualSandbox, type Sandbox} from '../sandbox'
import {ControlTreatment} from '../treatment'
import {runTrial} from './run'
import type {Trial} from './trial'

test.each([undefined, 'copilot-cli', 'copilot-sdk'] as const)(
  'withholds check files during the task and restores them for verification (runner: %s)',
  async runner => {
    const host = VirtualHost.create({
      '/scenarios/example/package.json': '{}',
      '/scenarios/example/scenario.config.ts': '',
      '/scenarios/example/scenario.test.ts': 'legacy test',
      '/scenarios/example/vitest.config.scenario.ts': 'private check config',
      '/scenarios/example/checks/reference.json': 'private reference',
      '/scenarios/example/src/reference.json': 'ordinary source',
      [`${COPILOT_DIR}/config.json`]: '{}',
      [`${AGENTS_DIR}/config.json`]: '{}',
    })
    await using sandbox: Sandbox = await VirtualSandbox.create({host})
    const checkRun = vi.fn<Trial['scenario']['checks'][number]['run']>(async ({sandbox: checkSandbox}) => {
      await expect(checkSandbox.readFile('vitest.config.scenario.ts')).resolves.toBe('private check config')
      await expect(checkSandbox.readFile('checks/reference.json')).resolves.toBe('private reference')
      await expect(checkSandbox.readFile('src/reference.json')).resolves.toBe('ordinary source')
      return [{type: 'outcomes', outcomes: [{type: 'outcome', status: 'passed'}]}]
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
        (command === 'copilot' && args.includes(trial.scenario.prompt)) ||
        (command === 'node' && args[0] === '/tmp/agent-eval-copilot-sdk-runner.cjs')
      ) {
        taskCalls++
        expect(copilotQueue.pending).toBe(1)
        expect(command).toBe(runner === 'copilot-sdk' ? 'node' : 'copilot')
        if (command === 'node') {
          expect(JSON.parse(await sandbox.readFile(args[1]))).toMatchObject({
            model: trial.model.name,
            reasoningEffort: trial.model.reasoningEffort,
            prompt: trial.scenario.prompt,
          })
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
          command === 'copilot' || command === 'node'
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
    expect(result.checks[0]?.result).toEqual({
      type: 'outcomes',
      outcomes: [{type: 'outcome', status: 'passed'}],
    })
  },
)

function createTrial(): Trial {
  return {
    id: 'trial',
    model: {name: 'gpt-5.5', reasoningEffort: 'high'},
    treatment: ControlTreatment,
    scenario: {
      id: 'example',
      directory: '/scenarios/example',
      prompt: 'Update the example',
      tags: [],
      judges: [],
      checks: [],
    },
  }
}

function createHost() {
  return VirtualHost.create({
    '/scenarios/example/package.json': '{}',
    [`${COPILOT_DIR}/auth.json`]: 'test-token',
    [`${COPILOT_DIR}/config.json`]: '{}',
    [`${AGENTS_DIR}/config.json`]: '{}',
  })
}

function successfulCommand(command: string) {
  return {
    exitCode: 0,
    stderr: '',
    stdout:
      command === 'copilot'
        ? JSON.stringify({
            type: 'result',
            timestamp: '2026-09-17T00:00:00.000Z',
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
}

test('can skip dependency installation and walkthrough capture', async () => {
  const host = createHost()
  const binary = Buffer.from([0, 1, 2, 255])
  await using sandbox: Sandbox = await VirtualSandbox.create({host})
  const runCommand = vi.spyOn(sandbox, 'runCommand').mockImplementation(async command => {
    if (command === 'copilot') {
      await sandbox.writeFile('candidate-output.txt', 'token: test-token')
      await host.fs.writeFile(`${CONTAINER_WORKDIR}/candidate-output.bin`, binary)
    }
    return successfulCommand(command)
  })

  const result = await runTrial({
    artifactsDirectory: '/artifacts',
    copilotQueue: new Queue({concurrency: 1}),
    copilotToken: 'test-token',
    execution: {
      captureWalkthrough: false,
      installDependencies: false,
    },
    host,
    sandbox,
    trial: createTrial(),
  })

  expect(runCommand).not.toHaveBeenCalledWith('npm', ['install'], expect.anything())
  expect(runCommand).not.toHaveBeenCalledWith(
    'npm',
    ['install', '-g', '--allow-scripts=agent-browser', 'agent-browser'],
    expect.anything(),
  )
  expect(
    runCommand.mock.calls.filter(([command]) => {
      return command === 'copilot'
    }),
  ).toHaveLength(1)
  expect(result.walkthrough).toEqual({type: 'Unavailable'})
  expect(result.artifacts.redactionApplied).toBe(true)
  await expect(host.fs.readFile('/artifacts/trial/workspace/candidate-output.txt', 'utf-8')).resolves.toBe(
    'token: [REDACTED]',
  )
  await expect(host.fs.readFile('/artifacts/trial/workspace/candidate-output.bin')).resolves.toEqual(binary)
  await expect(host.fs.access('/artifacts/trial/.copilot/auth.json')).rejects.toMatchObject({code: 'ENOENT'})
})

test.each([
  [{timeoutMs: 0}, 'timeoutMs must be a positive safe integer'],
  [{timeoutMs: 1.5}, 'timeoutMs must be a positive safe integer'],
  [{captureWalkthrough: 'no'}, 'captureWalkthrough must be a boolean'],
  [{installDependencies: 'no'}, 'installDependencies must be a boolean'],
])('rejects invalid execution options: %j', async (execution, message) => {
  const host = createHost()
  await using sandbox: Sandbox = await VirtualSandbox.create({host})

  await expect(
    runTrial({
      artifactsDirectory: '/artifacts',
      copilotQueue: new Queue({concurrency: 1}),
      copilotToken: 'test-token',
      // @ts-expect-error Runtime validation protects JavaScript callers.
      execution,
      host,
      sandbox,
      trial: createTrial(),
    }),
  ).rejects.toThrow(message)
})

test('times out, disposes the sandbox, and preserves failure evidence', async () => {
  const host = createHost()
  const sandbox: Sandbox = await VirtualSandbox.create({host})
  vi.spyOn(sandbox, 'copy').mockImplementation(() => new Promise<void>(() => {}))
  const dispose = vi.spyOn(sandbox, Symbol.asyncDispose).mockResolvedValue()

  await expect(
    runTrial({
      artifactsDirectory: '/artifacts',
      attempt: {maxRetries: 0, number: 1},
      copilotQueue: new Queue({concurrency: 1}),
      copilotToken: 'test-token',
      execution: {
        captureWalkthrough: false,
        installDependencies: false,
        timeoutMs: 5,
      },
      host,
      sandbox,
      trial: createTrial(),
    }),
  ).rejects.toMatchObject({
    name: 'TrialExecutionError',
    failure: {
      attempt: 1,
      kind: 'timeout',
      phase: 'setup',
      status: 'failed',
      trialId: 'trial',
    },
  })

  expect(dispose).toHaveBeenCalledOnce()
  await expect(host.fs.readFile('/artifacts/failures/trial/attempt-1/failure.json', 'utf-8')).resolves.toContain(
    '"kind": "timeout"',
  )
})

test('records sandbox disposal errors without losing timeout evidence', async () => {
  const host = createHost()
  const sandbox: Sandbox = await VirtualSandbox.create({host})
  vi.spyOn(sandbox, 'copy').mockImplementation(() => new Promise<void>(() => {}))
  vi.spyOn(sandbox, Symbol.asyncDispose).mockRejectedValue(new Error('disposal failed'))

  await expect(
    runTrial({
      artifactsDirectory: '/artifacts',
      attempt: {maxRetries: 0, number: 1},
      copilotQueue: new Queue({concurrency: 1}),
      copilotToken: 'test-token',
      execution: {
        captureWalkthrough: false,
        installDependencies: false,
        timeoutMs: 5,
      },
      host,
      sandbox,
      trial: createTrial(),
    }),
  ).rejects.toMatchObject({
    name: 'TrialExecutionError',
    failure: {
      artifactCaptureErrors: expect.arrayContaining(['disposal failed']),
      kind: 'timeout',
    },
  })

  const failure = JSON.parse(await host.fs.readFile('/artifacts/failures/trial/attempt-1/failure.json', 'utf-8')) as {
    artifactCaptureErrors: Array<string>
  }
  expect(failure.artifactCaptureErrors).toEqual(expect.arrayContaining(['disposal failed']))
})

test('preserves phase, attempt, and workspace evidence for execution failures', async () => {
  const host = createHost()
  await using sandbox: Sandbox = await VirtualSandbox.create({host})
  await sandbox.writeFile('candidate-output.txt', 'token: test-token')
  vi.spyOn(sandbox, 'runCommand').mockRejectedValue(new Error('setup failed with test-token'))

  await expect(
    runTrial({
      artifactsDirectory: '/artifacts',
      attempt: {maxRetries: 2, number: 2},
      copilotQueue: new Queue({concurrency: 1}),
      copilotToken: 'test-token',
      execution: {
        captureWalkthrough: false,
        installDependencies: false,
      },
      host,
      sandbox,
      trial: createTrial(),
    }),
  ).rejects.toMatchObject({
    cause: {
      message: 'setup failed with [REDACTED]',
    },
    failure: {
      attempt: 2,
      kind: 'execution',
      maxRetries: 2,
      phase: 'setup',
    },
  })

  const failure = JSON.parse(await host.fs.readFile('/artifacts/failures/trial/attempt-2/failure.json', 'utf-8')) as {
    artifacts: {workspaceDirectory: string}
    error: {message: string}
    redactionApplied: boolean
  }
  expect(failure.error.message).toBe('setup failed with [REDACTED]')
  expect(failure.redactionApplied).toBe(true)
  await expect(host.fs.stat(failure.artifacts.workspaceDirectory)).resolves.toBeDefined()
  await expect(host.fs.readFile(`${failure.artifacts.workspaceDirectory}/candidate-output.txt`, 'utf-8')).resolves.toBe(
    'token: [REDACTED]',
  )
})
