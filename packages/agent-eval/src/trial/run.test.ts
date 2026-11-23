import path from 'node:path'
import {Effect, Semaphore} from 'effect'
import {expect, test, vi} from 'vitest'
import {VirtualHost} from '../host'
import {AGENTS_DIR, COPILOT_DIR, VirtualSandbox, type Sandbox} from '../sandbox'
import {ControlTreatment} from '../treatment'
import {runTrial, TrialStageError} from './run'
import type {Trial} from './trial'

async function createLifecycleFixture(runner: Trial['runner'] = 'copilot-sdk') {
  const host = VirtualHost.create({
    '/home/sandbox/workspace/package.json': '{}',
    [`${COPILOT_DIR}/config.json`]: '{}',
    [`${AGENTS_DIR}/config.json`]: '{}',
  })
  const sandbox: Sandbox = await VirtualSandbox.create({host})
  const trial: Trial = {
    id: 'trial',
    model: {name: 'gpt-5.5', reasoningEffort: 'high'},
    runner,
    treatment: {...ControlTreatment},
    scenario: {
      id: 'example',
      directory: '/scenarios/example',
      prompt: 'Update the example',
      tags: [],
      judges: [],
      image: {type: 'Default'},
      checks: [],
    },
  }
  const runCommand = vi.spyOn(sandbox, 'runCommand').mockImplementation(async (command, args = []) => {
    if (args.includes('--usage-output-file')) {
      await sandbox.writeFile(args[args.indexOf('--usage-output-file') + 1], '{"modelMetrics":{}}')
    }
    if (command === '/opt/agent-eval/node/bin/node' || args.includes('--usage-output-file')) {
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
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
        }),
      }
    }
    if (command === '/opt/agent-eval/copilot/bin/copilot') {
      return {exitCode: 1, stderr: 'capture failed', stdout: ''}
    }
    if (['npm', 'npx', 'rm'].includes(command)) {
      return {exitCode: 0, stderr: '', stdout: ''}
    }
    throw new Error(`Unexpected command: ${command}`)
  })

  return {
    artifacts: {directory: '/artifacts/trial', stagingDirectory: '/staging/trial/attempt'},
    copilotSemaphore: Semaphore.makeUnsafe(1),
    copilotToken: 'test-token',
    host,
    sandbox,
    trial,
    runCommand,
  }
}

test('runTrial stops after setup rejection and leaves sandbox disposal to its caller', async () => {
  const fixture = await createLifecycleFixture()
  const error = new Error('setup failed')
  const dispose = vi.spyOn(fixture.sandbox, Symbol.asyncDispose)
  const laterSetup = vi.fn()
  fixture.trial.scenario.setup = async () => {
    throw error
  }
  fixture.trial.treatment.setup = laterSetup

  {
    await using sandbox = fixture.sandbox

    const failure = await Effect.runPromise(Effect.flip(runTrial({...fixture, sandbox})))

    expect(failure).toBeInstanceOf(TrialStageError)
    expect(failure).toMatchObject({
      trialId: 'trial',
      stage: 'Setup',
      message: 'Trial trial failed during Setup: setup failed',
    })
    expect(failure.cause).toBe(error)

    expect(laterSetup).not.toHaveBeenCalled()
    expect(fixture.runCommand).not.toHaveBeenCalled()
    expect(fixture.host.fs.existsSync('/staging/trial/attempt')).toBe(false)
    expect(dispose).not.toHaveBeenCalled()
  }
  expect(dispose).toHaveBeenCalledOnce()
})

test.each(['copilot-cli', 'copilot-sdk'] as const)(
  'runTrial propagates task failure without verification or taking sandbox ownership (runner: %s)',
  async runner => {
    const fixture = await createLifecycleFixture(runner)
    const error = new Error('agent command failed')
    const dispose = vi.spyOn(fixture.sandbox, Symbol.asyncDispose)
    const check = vi.fn<Trial['scenario']['checks'][number]['run']>()
    fixture.trial.scenario.checks = [{name: 'check', files: [], run: check}]
    fixture.runCommand.mockRejectedValueOnce(error)

    {
      await using sandbox = fixture.sandbox

      const failure = await Effect.runPromise(Effect.flip(runTrial({...fixture, sandbox})))

      expect(failure).toMatchObject({trialId: 'trial', stage: 'Task'})
      expect(failure.cause).toBe(error)

      expect(check).not.toHaveBeenCalled()
      expect(fixture.host.fs.existsSync('/staging/trial/attempt')).toBe(false)
      expect(dispose).not.toHaveBeenCalled()
    }
    expect(dispose).toHaveBeenCalledOnce()
  },
)

test('runTrial preserves failed evaluation data and saves artifacts when walkthrough capture fails', async () => {
  const fixture = await createLifecycleFixture()
  await using sandbox = fixture.sandbox
  const setupOrder: Array<string> = []
  fixture.trial.scenario.setup = async () => {
    setupOrder.push('scenario')
  }
  fixture.trial.setup = async () => {
    setupOrder.push('trial')
  }
  fixture.trial.treatment.setup = async () => {
    setupOrder.push('treatment')
  }
  fixture.trial.scenario.checks = [
    {
      name: 'check',
      files: [],
      async run() {
        expect(setupOrder).toEqual(['scenario', 'trial', 'treatment'])
        return [{type: 'outcomes', outcomes: [{type: 'outcome', status: 'failed', annotations: []}]}]
      },
    },
  ]

  const result = await Effect.runPromise(runTrial({...fixture, sandbox}))

  expect(result.walkthrough).toEqual({type: 'Unavailable'})
  expect(result.checks).toEqual([
    {
      check: {name: 'check', description: undefined, files: []},
      result: {type: 'outcomes', outcomes: [{type: 'outcome', status: 'failed', annotations: []}]},
    },
  ])
  await expect(
    fixture.host.fs.promises.readFile('/staging/trial/attempt/workspace/package.json', 'utf8'),
  ).resolves.toBe('{}')
})

test('runTrial downloads artifacts into the staging directory and records their final paths', async () => {
  const fixture = await createLifecycleFixture()
  await using sandbox = fixture.sandbox
  await sandbox.writeFile('walkthrough/screenshot.png', 'screenshot')

  const result = await Effect.runPromise(runTrial({...fixture, sandbox}))

  expect(result.walkthrough).toEqual({type: 'Screenshot', filepath: 'walkthrough/screenshot.png'})
  expect(result.artifacts).toEqual({
    directory: '/artifacts/trial',
    copilotConfigDirectory: '/artifacts/trial/.copilot',
    skillsConfigDirectory: '/artifacts/trial/.agents',
    walkthroughDirectory: '/artifacts/trial/walkthrough',
    workspaceDirectory: '/artifacts/trial/workspace',
  })
  await expect(
    fixture.host.fs.promises.readdir('/staging/trial/attempt').then(entries => {
      return entries.toSorted()
    }),
  ).resolves.toEqual(['.agents', '.copilot', 'walkthrough', 'workspace'])
  await expect(fixture.host.fs.promises.readFile('/staging/trial/attempt/.copilot/config.json', 'utf8')).resolves.toBe(
    '{}',
  )
  await expect(
    fixture.host.fs.promises.readFile('/staging/trial/attempt/walkthrough/screenshot.png', 'utf8'),
  ).resolves.toBe('screenshot')
  expect(fixture.host.fs.existsSync('/artifacts/trial')).toBe(false)
})

test('runTrial admits task commands through the shared concurrency limit', async () => {
  const first = await createLifecycleFixture()
  const second = await createLifecycleFixture()
  await using firstSandbox = first.sandbox
  await using secondSandbox = second.sandbox
  const started = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const secondQueued = Promise.withResolvers<void>()
  const command = first.runCommand.getMockImplementation()!
  first.runCommand.mockImplementationOnce(async (...args) => {
    started.resolve()
    await release.promise
    return command(...args)
  })
  const semaphore = first.copilotSemaphore
  const withPermits = semaphore.withPermits.bind(semaphore)
  const running: Array<Promise<unknown>> = []
  const firstRun = Effect.runPromise(runTrial({...first, sandbox: firstSandbox}))
  running.push(firstRun)
  const firstSettled = Promise.allSettled([firstRun])

  try {
    await started.promise
    vi.spyOn(semaphore, 'withPermits').mockImplementation(permits => {
      secondQueued.resolve()
      return withPermits(permits)
    })
    const secondRun = Effect.runPromise(runTrial({...second, sandbox: secondSandbox, copilotSemaphore: semaphore}))
    running.push(secondRun)
    const secondSettled = Promise.allSettled([secondRun])
    await secondQueued.promise

    expect(second.runCommand).not.toHaveBeenCalled()

    release.resolve()
    await expect(firstSettled).resolves.toMatchObject([{status: 'fulfilled'}])
    await expect(secondSettled).resolves.toMatchObject([{status: 'fulfilled'}])
    expect(
      second.runCommand.mock.calls.some(([name]) => {
        return name === '/opt/agent-eval/node/bin/node'
      }),
    ).toBe(true)
  } finally {
    release.resolve()
    await Promise.allSettled(running)
  }
})

test.each(['copilot-cli', 'copilot-sdk'] as const)(
  'withholds check files during the task and restores them for verification (runner: %s)',
  async runner => {
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
      return [{type: 'outcomes', outcomes: [{type: 'outcome', status: 'passed', annotations: []}]}]
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
    const copilotSemaphore = Semaphore.makeUnsafe(1)
    vi.spyOn(sandbox, 'runCommand').mockImplementation(async (command, args = []) => {
      if (
        (command === '/opt/agent-eval/copilot/bin/copilot' && args.includes(trial.scenario.prompt)) ||
        (command === '/opt/agent-eval/node/bin/node' && args[0] === '/opt/agent-eval/sdk-runner/run.cjs')
      ) {
        taskCalls++
        expect(Effect.runSync(copilotSemaphore.takeIfAvailable(1))).toBe(false)
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

    const result = await Effect.runPromise(
      runTrial({
        artifacts: {directory: '/artifacts/trial', stagingDirectory: '/staging/trial/attempt'},
        copilotSemaphore,
        copilotToken: 'test-token',
        host,
        sandbox,
        trial,
      }),
    )

    expect(taskCalls).toBe(1)
    expect(result.agent.sessions[0].outputTokens).toBe(runner === 'copilot-cli' ? 42 : 0)
    expect(sandbox.runCommand).toHaveBeenCalledWith(
      'npm',
      ['install', '-g', '--prefix', '/home/node/.npm-global', '--allow-scripts=agent-browser', 'agent-browser'],
      {user: '1000:1000'},
    )
    expect(checkRun).toHaveBeenCalledOnce()
    expect(result.checks[0]?.result).toEqual({
      type: 'outcomes',
      outcomes: [{type: 'outcome', status: 'passed', annotations: []}],
    })
  },
)

test.each(['copilot-cli', 'copilot-sdk'] as const)(
  'preserves separate task, judge, and walkthrough traces in trial artifacts (runner: %s)',
  async runner => {
    const host = VirtualHost.create({
      [`${COPILOT_DIR}/config.json`]: '{}',
      [`${AGENTS_DIR}/config.json`]: '{}',
      '/home/sandbox/workspace/package.json': '{}',
    })
    await using sandbox: Sandbox = await VirtualSandbox.create({host})
    const traces = new Map<string, string>()
    vi.spyOn(sandbox, 'runCommand').mockImplementation(async (command, args = [], options) => {
      if (command === '/opt/agent-eval/copilot/bin/copilot' || command === '/opt/agent-eval/node/bin/node') {
        const env = options?.env ?? {}
        expect(env).toMatchObject({
          COPILOT_OTEL_ENABLED: 'true',
          COPILOT_OTEL_EXPORTER_TYPE: 'file',
          OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT: 'false',
        })
        const filepath = env.COPILOT_OTEL_FILE_EXPORTER_PATH
        expect(filepath).toMatch(new RegExp(`^${COPILOT_DIR}/otel-.*\\.jsonl$`))
        expect(traces.has(filepath)).toBe(false)
        const contents = `${JSON.stringify({name: `session-${traces.size}`})}\n`
        traces.set(filepath, contents)
        await sandbox.writeFile(filepath, contents)
        if (args.includes('--usage-output-file')) {
          await sandbox.writeFile(args[args.indexOf('--usage-output-file') + 1], '{"modelMetrics":{}}')
        }
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            type: 'result',
            timestamp: '2026-10-24T00:00:00.000Z',
            sessionId: `session-${traces.size}`,
            exitCode: 0,
            usage: {
              premiumRequests: 0,
              totalApiDurationMs: 0,
              sessionDurationMs: 0,
              codeChanges: {linesAdded: 0, linesRemoved: 0, filesModified: []},
            },
          }),
        }
      }
      return {exitCode: 0, stderr: '', stdout: ''}
    })

    const result = await Effect.runPromise(
      runTrial({
        artifacts: {directory: '/artifacts/trial', stagingDirectory: '/staging/trial/attempt'},
        copilotSemaphore: Semaphore.makeUnsafe(1),
        copilotToken: 'test-token',
        host,
        sandbox,
        trial: {
          id: 'trial',
          model: {name: 'gpt-5.5', reasoningEffort: 'high'},
          runner,
          treatment: ControlTreatment,
          scenario: {
            id: 'example',
            directory: '/scenarios/example',
            prompt: 'Build a page',
            tags: [],
            checks: [],
            judges: [{name: 'quality', files: [], scores: [{value: 1, description: 'Good'}]}],
            image: {type: 'Default'},
          },
        },
      }),
    )

    expect(result.artifacts.copilotConfigDirectory).toBe('/artifacts/trial/.copilot')
    expect(traces.size).toBe(3)
    for (const [filepath, contents] of traces) {
      const savedPath = path.join('/staging/trial/attempt/.copilot', path.basename(filepath))
      await expect(host.fs.promises.readFile(savedPath, 'utf8')).resolves.toBe(contents)
    }
  },
)
