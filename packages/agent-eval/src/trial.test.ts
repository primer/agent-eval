import path from 'node:path'
import {describe, expect, test, vi} from 'vitest'
import {VirtualHost, type Host} from './host'
import {
  AGENTS_DIR,
  CONTAINER_WORKDIR,
  COPILOT_DIR,
  NODE_USER,
  SKILLS_DIR,
  type CommandResult,
  type Sandbox,
} from './sandbox'
import {
  readTrialFiles,
  run,
  TrialExecutionError,
  validateTrialExecutionOptions,
  writeTrialFiles,
  type Trial,
} from './trial'
import type {ResultMessage} from './copilot-cli'

async function setup(trial: Trial) {
  const artifactsDirectory = '/artifacts'
  const host = VirtualHost.create({
    [AGENTS_DIR]: {},
    [COPILOT_DIR]: {},
    [artifactsDirectory]: {},
    [trial.scenario.directory]: {
      '.next': {
        'build.txt': '',
      },
      node_modules: {
        'dependency.txt': '',
      },
      'scenario.config.ts': '',
      'scenario.test.ts': '',
      ...(trial.scenario.browserTestPath ? {[path.basename(trial.scenario.browserTestPath)]: ''} : {}),
    },
  })
  const sandbox = await host.createSandbox()

  vi.spyOn(sandbox, 'copy')

  return {
    artifactsDirectory,
    copilotToken: '',
    host,
    sandbox,
  }
}

type RunCommandMockOptions = {
  params: Parameters<Sandbox['runCommand']>
  sandbox: Sandbox
}
type RunCommandMock = (options: RunCommandMockOptions) => Promise<CommandResult | null | undefined>

async function applyCommandMocks(
  mocks: Array<RunCommandMock>,
  options: RunCommandMockOptions,
): Promise<CommandResult | null | undefined> {
  for (const mock of mocks) {
    const result = await mock(options)
    if (result) {
      return result
    }
  }
}

const writeCopilotResult: RunCommandMock = async ({params}) => {
  const [command, args] = params
  if (command === 'copilot' && Array.isArray(args) && args[0] === '--prompt') {
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
}

const writeTestFile: RunCommandMock = async ({params, sandbox}) => {
  const [command, args] = params
  if (
    command === 'sh' &&
    Array.isArray(args) &&
    args[0] === '-c' &&
    args[1].startsWith('./node_modules/.bin/vitest run')
  ) {
    const config = await sandbox.readFile('vitest.agent-eval.config.ts')
    const outputFile = config.match(/outputFile: "([^"]+)"/)?.[1]
    if (!outputFile) {
      throw new Error('Vitest output file was not configured')
    }

    await sandbox.writeFile(
      outputFile,
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
}

function createTrial(): Trial {
  return {
    id: 'test-id',
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
}

function mockRunCommand(sandbox: Sandbox, mocks: Array<RunCommandMock> = []) {
  const runCommand = sandbox.runCommand

  vi.spyOn(sandbox, 'runCommand').mockImplementation(async (command, args, commandOptions) => {
    const result = await applyCommandMocks([...mocks, writeTestFile, writeCopilotResult], {
      params: [command, args, commandOptions],
      sandbox,
    })
    if (result) {
      return result
    }
    return runCommand(command, args, commandOptions)
  })
}

function writeWalkthroughArtifact(filepath: string, contents = ''): RunCommandMock {
  return async ({params, sandbox}) => {
    const [command, args] = params
    if (
      command === 'copilot' &&
      Array.isArray(args) &&
      args[0] === '--prompt' &&
      args[1].startsWith('Record a visual walkthrough')
    ) {
      await sandbox.writeFile(filepath, contents)
    }
  }
}

function manageAgentBrowserSkill(host: Host): RunCommandMock {
  return async ({params, sandbox}) => {
    const [command, args] = params
    const skillDirectory = path.posix.join(SKILLS_DIR, 'agent-browser')

    if (command === 'npx' && Array.isArray(args) && args[0] === 'skills' && args[1] === 'add') {
      await sandbox.writeFile(path.posix.join(skillDirectory, 'SKILL.md'), 'agent browser skill')
    }

    if (command === 'rm' && Array.isArray(args) && args[0] === '-rf' && args[1] === skillDirectory) {
      await host.fs.rm(skillDirectory, {recursive: true, force: true})
    }
  }
}

type TrialFile = {
  artifacts: {
    directory: string
  }
  id: string
}

function parseTrialFile(): TrialFile {
  return {
    artifacts: {
      directory: '/bundle/artifacts/trial',
    },
    id: 'trial',
  }
}

test('writeTrialFiles rejects trial files outside the output directory', async () => {
  const host = VirtualHost.create()
  const trial: TrialFile = {
    artifacts: {
      directory: '/outside',
    },
    id: 'trial',
  }

  await expect(writeTrialFiles('/bundle/output.json', new Map([['trial', trial]]), {host})).rejects.toThrow(
    'Trial file for "trial" "../outside/trial.json" must be within the output directory',
  )
  await expect(host.fs.stat('/outside/trial.json')).rejects.toThrow()
})

test.each([
  {
    reference: '../secret.json',
    message: 'Trial reference for "trial" "../secret.json" must be within the output directory',
  },
  {
    reference: '..\\secret.json',
    message: 'Trial reference for "trial" "..\\secret.json" must be within the output directory',
  },
  {
    reference: '/secret.json',
    message: 'Trial reference for "trial" "/secret.json" must be relative to the output directory',
  },
  {
    reference: 'C:\\secret.json',
    message: 'Trial reference for "trial" "C:\\secret.json" must be relative to the output directory',
  },
])('readTrialFiles rejects trial reference $reference outside the output directory', async ({reference, message}) => {
  const host = VirtualHost.create({
    '/secret.json': JSON.stringify({
      artifacts: {
        directory: '/outside',
      },
      id: 'trial',
    }),
  })

  await expect(readTrialFiles('/bundle/output.json', {trial: reference}, parseTrialFile, {host})).rejects.toThrow(
    message,
  )
})

describe('run', () => {
  test('collects output tokens from model messages without double counting assistant messages', async () => {
    const trial = createTrial()
    const {sandbox, ...runOptions} = await setup(trial)
    const writeTokenOutput: RunCommandMock = async ({params}) => {
      const [command, args] = params
      if (command !== 'copilot' || !Array.isArray(args) || args[0] !== '--prompt') {
        return
      }

      return {
        stdout: [
          JSON.stringify({
            type: 'model.message',
            data: {
              message: {
                role: 'assistant',
                outputTokens: 42,
              },
            },
            ephemeral: true,
            id: 'model-message',
            timestamp: '',
            parentId: '',
          }),
          JSON.stringify({
            type: 'assistant.message',
            data: {
              messageId: 'assistant-message',
              content: 'Done.',
              toolRequests: [],
              interactionId: 'interaction',
              turnId: 'turn',
              outputTokens: 42,
            },
            id: 'assistant-message',
            timestamp: '',
            parentId: '',
          }),
          JSON.stringify({
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
          }),
        ].join('\n'),
        stderr: '',
        exitCode: 0,
      }
    }
    mockRunCommand(sandbox, [writeTokenOutput])

    const result = await run({
      ...runOptions,
      sandbox,
      trial,
    })

    expect(result.agent.sessions[0].outputTokens).toBe(42)
  })

  test('copies scenario files into the container workdir', async () => {
    const trial: Trial = {
      id: 'test-id',
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
    const {sandbox, ...runOptions} = await setup(trial)
    const runCommand = sandbox.runCommand

    vi.spyOn(sandbox, 'runCommand').mockImplementation(async (command, args, commandOptions) => {
      const result = await applyCommandMocks([writeTestFile, writeCopilotResult], {
        params: [command, args, commandOptions],
        sandbox,
      })
      if (result) {
        return result
      }
      return runCommand(command, args, commandOptions)
    })

    await run({
      ...runOptions,
      sandbox,
      trial,
    })

    expect(sandbox.copy).toHaveBeenCalledWith(trial.scenario.directory, CONTAINER_WORKDIR, {
      exclude: [
        'scenario.config.ts',
        'scenario.test.ts',
        'browser.test.ts',
        'scenario.browser.test.ts',
        'node_modules',
        '.next',
        'dist',
      ],
    })
  })

  test('sets permissions for the scenario files', async () => {
    const trial: Trial = {
      id: 'test-id',
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
    const {sandbox, ...runOptions} = await setup(trial)
    const runCommand = sandbox.runCommand

    vi.spyOn(sandbox, 'runCommand').mockImplementation(async (command, args, commandOptions) => {
      const result = await applyCommandMocks([writeTestFile, writeCopilotResult], {
        params: [command, args, commandOptions],
        sandbox,
      })
      if (result) {
        return result
      }
      return runCommand(command, args, commandOptions)
    })

    await run({
      ...runOptions,
      sandbox,
      trial,
    })

    expect(sandbox.runCommand).toHaveBeenCalledWith('chown', ['-R', NODE_USER, '.'], {
      user: 'root',
    })
  })

  test('obfuscates the package name', async () => {
    const trial: Trial = {
      id: 'test-id',
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
    const {sandbox, ...runOptions} = await setup(trial)
    const runCommand = sandbox.runCommand

    vi.spyOn(sandbox, 'runCommand').mockImplementation(async (command, args, commandOptions) => {
      const result = await applyCommandMocks([writeTestFile, writeCopilotResult], {
        params: [command, args, commandOptions],
        sandbox,
      })
      if (result) {
        return result
      }
      return runCommand(command, args, commandOptions)
    })

    await run({
      ...runOptions,
      sandbox,
      trial,
    })

    expect(sandbox.runCommand).toHaveBeenCalledWith('npm', ['pkg', 'set', `name=${trial.id}`], {
      user: NODE_USER,
    })
  })

  test('removes @primer/agent-eval from the workspace dependencies', async () => {
    const trial: Trial = {
      id: 'test-id',
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
    const {sandbox, ...runOptions} = await setup(trial)
    const runCommand = sandbox.runCommand

    vi.spyOn(sandbox, 'runCommand').mockImplementation(async (command, args, commandOptions) => {
      const result = await applyCommandMocks([writeTestFile, writeCopilotResult], {
        params: [command, args, commandOptions],
        sandbox,
      })
      if (result) {
        return result
      }
      return runCommand(command, args, commandOptions)
    })

    await run({
      ...runOptions,
      sandbox,
      trial,
    })

    expect(sandbox.runCommand).toHaveBeenCalledWith('npm', ['pkg', 'delete', 'devDependencies.@primer/agent-eval'], {
      user: NODE_USER,
    })
  })

  test('installs workspace dependencies', async () => {
    const trial: Trial = {
      id: 'test-id',
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
    const {sandbox, ...runOptions} = await setup(trial)
    const runCommand = sandbox.runCommand

    vi.spyOn(sandbox, 'runCommand').mockImplementation(async (command, args, commandOptions) => {
      const result = await applyCommandMocks([writeTestFile, writeCopilotResult], {
        params: [command, args, commandOptions],
        sandbox,
      })
      if (result) {
        return result
      }
      return runCommand(command, args, commandOptions)
    })

    await run({
      ...runOptions,
      sandbox,
      trial,
    })

    expect(sandbox.runCommand).toHaveBeenCalledWith('npm', ['install'], {
      user: NODE_USER,
    })
  })

  test('skips workspace dependency installation when installDependencies is false', async () => {
    const trial = createTrial()
    const {sandbox, ...runOptions} = await setup(trial)
    mockRunCommand(sandbox)

    await run({
      ...runOptions,
      execution: {
        captureWalkthrough: false,
        installDependencies: false,
      },
      sandbox,
      trial,
    })

    expect(sandbox.runCommand).not.toHaveBeenCalledWith('npm', ['install'], {
      user: NODE_USER,
    })
    expect(sandbox.runCommand).toHaveBeenCalledWith('npm', ['run', 'build', '--if-present'], {
      user: NODE_USER,
    })
  })

  test('runs the generic setup', async () => {
    const genericSetup = vi.fn(async () => {
      //
    })
    const trial: Trial = {
      id: 'test-id',
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
      setup: genericSetup,
    }
    const {sandbox, ...runOptions} = await setup(trial)
    const runCommand = sandbox.runCommand

    vi.spyOn(sandbox, 'runCommand').mockImplementation(async (command, args, commandOptions) => {
      const result = await applyCommandMocks([writeTestFile, writeCopilotResult], {
        params: [command, args, commandOptions],
        sandbox,
      })
      if (result) {
        return result
      }
      return runCommand(command, args, commandOptions)
    })

    await run({
      ...runOptions,
      sandbox,
      trial,
    })

    expect(genericSetup).toHaveBeenCalledWith({
      sandbox,
    })
  })

  test('runs the treatment setup', async () => {
    const treatmentSetup = vi.fn(async () => {
      //
    })
    const trial: Trial = {
      id: 'test-id',
      scenario: {
        id: 'test-id',
        directory: '/scenarios/test',
        prompt: 'test-prompt',
        tags: [],
        testPath: '/scenarios/test/scenario.test.ts',
      },
      treatment: {
        name: 'test-treatment-name',
        setup: treatmentSetup,
      },
      model: {
        name: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
      },
    }
    const {sandbox, ...runOptions} = await setup(trial)
    const runCommand = sandbox.runCommand

    vi.spyOn(sandbox, 'runCommand').mockImplementation(async (command, args, commandOptions) => {
      const result = await applyCommandMocks([writeTestFile, writeCopilotResult], {
        params: [command, args, commandOptions],
        sandbox,
      })
      if (result) {
        return result
      }
      return runCommand(command, args, commandOptions)
    })

    await run({
      ...runOptions,
      sandbox,
      trial,
    })

    expect(treatmentSetup).toHaveBeenCalledWith({
      sandbox,
    })
  })

  test('runs the build script when one exists', async () => {
    const trial = createTrial()
    const {sandbox, host, ...runOptions} = await setup(trial)
    await host.fs.writeFile(
      path.join(trial.scenario.directory, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'build',
        },
      }),
    )
    mockRunCommand(sandbox)

    await run({
      ...runOptions,
      host,
      sandbox,
      trial,
    })

    expect(sandbox.runCommand).toHaveBeenCalledWith('npm', ['run', 'build', '--if-present'], {
      user: NODE_USER,
    })
  })

  test('continues when no build script exists', async () => {
    const trial = createTrial()
    const {sandbox, ...runOptions} = await setup(trial)
    mockRunCommand(sandbox)

    await expect(
      run({
        ...runOptions,
        sandbox,
        trial,
      }),
    ).resolves.toMatchObject({
      trial,
    })
  })

  test('runs Copilot with the trial arguments', async () => {
    const trial = createTrial()
    const {sandbox, ...runOptions} = await setup(trial)
    const copilotToken = 'test-token'
    mockRunCommand(sandbox)

    await run({
      ...runOptions,
      copilotToken,
      sandbox,
      trial,
    })

    expect(sandbox.runCommand).toHaveBeenCalledWith(
      'copilot',
      [
        '--prompt',
        trial.scenario.prompt,
        '--model',
        trial.model.name,
        '--reasoning-effort',
        trial.model.reasoningEffort,
        '--mode',
        'autopilot',
        '--allow-all',
        '--no-auto-update',
        '--usage-output-file',
        '/tmp/agent-eval-candidate/usage.json',
        '--log-dir',
        '/tmp/agent-eval-candidate/logs',
        '--output-format',
        'json',
      ],
      {
        allowNonZeroExitCode: true,
        user: NODE_USER,
        env: {
          COPILOT_GITHUB_TOKEN: copilotToken,
        },
        onStderr: expect.any(Function),
        onStdout: expect.any(Function),
      },
    )
  })

  test('forwards the candidate credit limit', async () => {
    const trial = createTrial()
    const {sandbox, ...runOptions} = await setup(trial)
    mockRunCommand(sandbox)

    await run({
      ...runOptions,
      execution: {
        captureWalkthrough: false,
        maxAiCredits: 100,
      },
      sandbox,
      trial,
    })

    expect(sandbox.runCommand).toHaveBeenCalledWith(
      'copilot',
      expect.arrayContaining(['--max-ai-credits', '100']),
      expect.objectContaining({
        allowNonZeroExitCode: true,
      }),
    )
  })

  test('skips all walkthrough work when captureWalkthrough is false', async () => {
    const trial = createTrial()
    const {sandbox, ...runOptions} = await setup(trial)
    mockRunCommand(sandbox)

    const result = await run({
      ...runOptions,
      execution: {
        captureWalkthrough: false,
      },
      sandbox,
      trial,
    })

    const copilotCalls = vi.mocked(sandbox.runCommand).mock.calls.filter(([command]) => {
      return command === 'copilot'
    })
    expect(copilotCalls).toHaveLength(1)
    expect(sandbox.runCommand).not.toHaveBeenCalledWith(
      'npm',
      ['install', '-g', '--allow-scripts=agent-browser', 'agent-browser'],
      expect.anything(),
    )
    expect(sandbox.runCommand).not.toHaveBeenCalledWith(
      'npx',
      expect.arrayContaining(['skills', 'add', 'vercel-labs/agent-browser']),
      expect.anything(),
    )
    expect(await sandbox.exists('agent-browser.json')).toBe(false)
    expect(result.walkthrough).toEqual({
      type: 'Unavailable',
    })
  })

  test('disposes the owned sandbox when the trial times out', async () => {
    const trial = createTrial()
    const {sandbox, host, ...runOptions} = await setup(trial)
    const dispose = vi.spyOn(sandbox, Symbol.asyncDispose)
    const runCommand = sandbox.runCommand

    vi.spyOn(sandbox, 'runCommand').mockImplementation(async (command, args, commandOptions) => {
      if (command === 'copilot' && args?.[0] === '--prompt') {
        await sandbox.writeFile('/tmp/agent-eval-candidate/usage.json', '{"aiCredits":42}')
        await sandbox.writeFile('/tmp/agent-eval-candidate/logs/copilot.log', 'partial log')
        commandOptions?.onStdout?.('{"type":"partial"')
        return new Promise(() => {})
      }
      return runCommand(command, args, commandOptions)
    })

    await expect(
      run({
        ...runOptions,
        execution: {
          captureWalkthrough: false,
          timeoutMs: 10,
        },
        host,
        sandbox,
        trial,
      }),
    ).rejects.toMatchObject({
      failure: {
        kind: 'timeout',
        status: 'failed',
      },
    })

    expect(dispose).toHaveBeenCalledOnce()
    await expect(host.fs.readFile('/artifacts/test-id/attempts/1/candidate.stdout.log', 'utf8')).resolves.toBe(
      '{"type":"partial"',
    )
    await expect(host.fs.readFile('/artifacts/test-id/attempts/1/candidate-usage.json', 'utf8')).resolves.toBe(
      '{"aiCredits":42}',
    )
    await expect(host.fs.readFile('/artifacts/test-id/attempts/1/candidate-logs/copilot.log', 'utf8')).resolves.toBe(
      'partial log',
    )
  })

  test('retains raw candidate output when parsing fails', async () => {
    const trial = createTrial()
    const {sandbox, host, ...runOptions} = await setup(trial)
    const malformedOutput = '{"type":"assistant.turn_start"'
    const writeMalformedOutput: RunCommandMock = async ({params, sandbox: testSandbox}) => {
      const [command, args] = params
      if (command === 'copilot' && args?.[0] === '--prompt') {
        await testSandbox.writeFile('/tmp/agent-eval-candidate/usage.json', '{"aiCredits":23}')
        await testSandbox.writeFile('/tmp/agent-eval-candidate/logs/copilot.log', 'candidate log')
        return {
          stdout: malformedOutput,
          stderr: 'candidate stderr',
          exitCode: 0,
        }
      }
    }
    mockRunCommand(sandbox, [writeMalformedOutput])

    await expect(
      run({
        ...runOptions,
        execution: {
          captureWalkthrough: false,
        },
        host,
        sandbox,
        trial,
      }),
    ).rejects.toBeInstanceOf(TrialExecutionError)

    await expect(host.fs.readFile('/artifacts/test-id/attempts/1/candidate.stdout.log', 'utf8')).resolves.toBe(
      malformedOutput,
    )
    await expect(host.fs.readFile('/artifacts/test-id/attempts/1/candidate.stderr.log', 'utf8')).resolves.toBe(
      'candidate stderr',
    )
    await expect(host.fs.readFile('/artifacts/test-id/attempts/1/candidate-usage.json', 'utf8')).resolves.toBe(
      '{"aiCredits":23}',
    )
    await expect(host.fs.readFile('/artifacts/test-id/attempts/1/candidate-logs/copilot.log', 'utf8')).resolves.toBe(
      'candidate log',
    )
    await expect(host.fs.readFile('/artifacts/test-id/attempts/1/failure.json', 'utf8')).resolves.toContain(
      '"kind": "invalid-output"',
    )
  })

  test('does not grade a candidate whose JSON result reports failure', async () => {
    const trial = createTrial()
    const {sandbox, host, ...runOptions} = await setup(trial)
    const writeFailedResult: RunCommandMock = async ({params}) => {
      const [command, args] = params
      if (command === 'copilot' && args?.[0] === '--prompt') {
        const result: ResultMessage = {
          type: 'result',
          timestamp: '',
          sessionId: '',
          exitCode: 1,
          usage: {
            premiumRequests: 1,
            totalApiDurationMs: 10,
            sessionDurationMs: 20,
            codeChanges: {
              linesAdded: 0,
              linesRemoved: 0,
              filesModified: [],
            },
          },
        }
        return {
          stdout: JSON.stringify(result),
          stderr: '',
          exitCode: 0,
        }
      }
    }
    mockRunCommand(sandbox, [writeFailedResult])

    await expect(
      run({
        ...runOptions,
        execution: {
          captureWalkthrough: false,
        },
        host,
        sandbox,
        trial,
      }),
    ).rejects.toMatchObject({
      failure: {
        candidateExitCode: 1,
        kind: 'candidate-exit',
        phase: 'candidate-output',
      },
    })

    const testCalls = vi.mocked(sandbox.runCommand).mock.calls.filter(([command]) => {
      return command === 'sh'
    })
    expect(testCalls).toHaveLength(0)
    await expect(host.fs.readFile('/artifacts/test-id/attempts/1/candidate-session.json', 'utf8')).resolves.toContain(
      '"premiumRequests":1',
    )
  })

  test('retains raw artifacts when the candidate process exits nonzero', async () => {
    const trial = createTrial()
    const {sandbox, host, ...runOptions} = await setup(trial)
    const writeFailedProcess: RunCommandMock = async ({params, sandbox: testSandbox}) => {
      const [command, args] = params
      if (command === 'copilot' && args?.[0] === '--prompt') {
        await testSandbox.writeFile('/tmp/agent-eval-candidate/usage.json', '{"aiCredits":100}')
        return {
          stdout: '{"type":"session.info"}',
          stderr: 'budget exhausted',
          exitCode: 2,
        }
      }
    }
    mockRunCommand(sandbox, [writeFailedProcess])

    await expect(
      run({
        ...runOptions,
        execution: {
          captureWalkthrough: false,
        },
        host,
        sandbox,
        trial,
      }),
    ).rejects.toMatchObject({
      failure: {
        candidateExitCode: 2,
        kind: 'candidate-exit',
        phase: 'candidate',
      },
    })

    await expect(host.fs.readFile('/artifacts/test-id/attempts/1/candidate.stdout.log', 'utf8')).resolves.toBe(
      '{"type":"session.info"}',
    )
    await expect(host.fs.readFile('/artifacts/test-id/attempts/1/candidate.stderr.log', 'utf8')).resolves.toBe(
      'budget exhausted',
    )
    await expect(host.fs.readFile('/artifacts/test-id/attempts/1/candidate-usage.json', 'utf8')).resolves.toBe(
      '{"aiCredits":100}',
    )
  })

  test.each([
    [{maxAiCredits: 29}, 'maxAiCredits'],
    [{maxAiCredits: Number.NaN}, 'maxAiCredits'],
    [{timeoutMs: 0}, 'timeoutMs'],
    [{timeoutMs: Number.POSITIVE_INFINITY}, 'timeoutMs'],
    [{installDependencies: 'no' as never}, 'installDependencies'],
  ])('rejects invalid execution options %o', (execution, message) => {
    expect(() => {
      validateTrialExecutionOptions(execution)
    }).toThrow(message)
  })

  test('runs the scenario tests', async () => {
    const trial = createTrial()
    const {sandbox, ...runOptions} = await setup(trial)
    vi.spyOn(sandbox, 'writeFile')
    mockRunCommand(sandbox)

    await run({
      ...runOptions,
      sandbox,
      trial,
    })

    expect(sandbox.copy).toHaveBeenCalledWith(trial.scenario.testPath, 'scenario.test.ts')
    expect(sandbox.writeFile).toHaveBeenCalledWith(
      'vitest.agent-eval.config.ts',
      expect.stringContaining('outputFile: "test-results.json"'),
    )
    expect(sandbox.runCommand).toHaveBeenCalledWith(
      'npm',
      ['install', '--no-save', '--package-lock=false', 'vitest@4.1.11'],
      {
        user: NODE_USER,
      },
    )
    expect(sandbox.runCommand).toHaveBeenCalledWith(
      'sh',
      [
        '-c',
        './node_modules/.bin/vitest run --config "$1" "$2" || true',
        'vitest-run',
        'vitest.agent-eval.config.ts',
        'scenario.test.ts',
      ],
      {
        user: NODE_USER,
        env: {},
      },
    )
  })

  test('runs and combines browser tests with scenario tests', async () => {
    const trial = createTrial()
    trial.scenario.browserTestPath = '/scenarios/test/scenario.browser.test.ts'
    const {sandbox, ...runOptions} = await setup(trial)
    const writeTestResults: RunCommandMock = async ({params, sandbox: testSandbox}) => {
      const [command, args] = params
      if (command !== 'sh' || !Array.isArray(args) || args[0] !== '-c') {
        return
      }

      const browser = args.at(-1) === 'scenario.browser.test.ts'
      const outputFile = browser ? 'browser-test-results.json' : 'test-results.json'
      await testSandbox.writeFile(
        outputFile,
        JSON.stringify({
          numTotalTests: 1,
          numPassedTests: browser ? 0 : 1,
          numFailedTests: browser ? 1 : 0,
          numPendingTests: 0,
          numTodoTests: 0,
          success: !browser,
          testResults: [
            {
              assertionResults: [],
            },
          ],
        }),
      )

      return {
        stdout: '',
        stderr: '',
        exitCode: 0,
      }
    }
    mockRunCommand(sandbox, [writeTestResults])

    const result = await run({
      ...runOptions,
      sandbox,
      trial,
    })

    expect(sandbox.runCommand).toHaveBeenCalledWith(
      'npm',
      ['install', '--no-save', '--package-lock=false', 'vitest', 'playwright', '@vitest/browser-playwright'],
      {
        user: NODE_USER,
      },
    )
    expect(sandbox.runCommand).toHaveBeenCalledWith(
      './node_modules/.bin/playwright',
      ['install', '--with-deps', 'chromium'],
      {
        user: 'root',
        env: {
          PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright',
        },
      },
    )
    expect(sandbox.copy).toHaveBeenCalledWith(trial.scenario.browserTestPath, 'scenario.browser.test.ts')
    expect(sandbox.runCommand).toHaveBeenCalledWith(
      'sh',
      [
        '-c',
        './node_modules/.bin/vitest run --config "$1" "$2" || true',
        'vitest-run',
        'vitest.agent-eval.config.ts',
        'scenario.browser.test.ts',
      ],
      {
        user: NODE_USER,
        env: {
          PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright',
        },
      },
    )
    expect(result.testResults).toMatchObject({
      numTotalTests: 2,
      numPassedTests: 1,
      numFailedTests: 1,
      success: false,
    })
  })

  test('runs Copilot with the walkthrough arguments', async () => {
    const trial = createTrial()
    const {sandbox, ...runOptions} = await setup(trial)
    const copilotToken = 'test-token'
    mockRunCommand(sandbox)

    await run({
      ...runOptions,
      copilotToken,
      sandbox,
      trial,
    })

    expect(sandbox.runCommand).toHaveBeenCalledWith(
      'copilot',
      [
        '--prompt',
        expect.stringContaining('Record a visual walkthrough'),
        '--model',
        'gpt-5.6-terra',
        '--reasoning-effort',
        'medium',
        '--mode',
        'autopilot',
        '--allow-all',
        '--no-auto-update',
        '--output-format',
        'json',
      ],
      {
        user: NODE_USER,
        env: {
          COPILOT_GITHUB_TOKEN: copilotToken,
        },
        allowNonZeroExitCode: true,
      },
    )
  })

  describe('walkthrough artifacts', () => {
    test('returns unavailable when no walkthrough artifact exists', async () => {
      const trial = createTrial()
      const {sandbox, ...runOptions} = await setup(trial)
      mockRunCommand(sandbox)

      const result = await run({
        ...runOptions,
        sandbox,
        trial,
      })

      expect(result.walkthrough).toEqual({
        type: 'Unavailable',
      })
    })

    test('returns a video walkthrough', async () => {
      const trial = createTrial()
      const {sandbox, ...runOptions} = await setup(trial)
      mockRunCommand(sandbox, [writeWalkthroughArtifact('walkthrough/walkthrough.webm')])

      const result = await run({
        ...runOptions,
        sandbox,
        trial,
      })

      expect(result.walkthrough).toEqual({
        type: 'Video',
        filepath: '/artifacts/test-id/walkthrough/walkthrough.webm',
      })
    })

    test('returns multiple walkthrough screenshots', async () => {
      const trial = createTrial()
      const {sandbox, ...runOptions} = await setup(trial)
      const writeScreenshots: RunCommandMock = async options => {
        await writeWalkthroughArtifact('walkthrough/screenshots/10.png')(options)
        await writeWalkthroughArtifact('walkthrough/screenshots/2.jpg')(options)
        await writeWalkthroughArtifact('walkthrough/screenshots/01.jpeg')(options)
        await writeWalkthroughArtifact('walkthrough/screenshots/notes.txt')(options)
      }
      mockRunCommand(sandbox, [writeScreenshots])

      const result = await run({
        ...runOptions,
        sandbox,
        trial,
      })

      expect(result.walkthrough).toEqual({
        type: 'Screenshots',
        screenshots: [
          '/artifacts/test-id/walkthrough/screenshots/01.jpeg',
          '/artifacts/test-id/walkthrough/screenshots/2.jpg',
          '/artifacts/test-id/walkthrough/screenshots/10.png',
        ],
      })
    })

    test('returns a single walkthrough screenshot', async () => {
      const trial = createTrial()
      const {sandbox, ...runOptions} = await setup(trial)
      mockRunCommand(sandbox, [writeWalkthroughArtifact('walkthrough/screenshot.png')])

      const result = await run({
        ...runOptions,
        sandbox,
        trial,
      })

      expect(result.walkthrough).toEqual({
        type: 'Screenshot',
        filepath: '/artifacts/test-id/walkthrough/screenshot.png',
      })
    })
  })

  describe('artifacts', () => {
    test('creates the artifact directory when it does not exist', async () => {
      const trial = createTrial()
      const {sandbox, host, ...runOptions} = await setup(trial)
      mockRunCommand(sandbox)

      expect(host.existsSync('/artifacts/test-id')).toBe(false)

      await run({
        ...runOptions,
        host,
        sandbox,
        trial,
      })

      expect(host.existsSync('/artifacts/test-id/workspace')).toBe(true)
    })

    test('empties the artifact directory when it already exists', async () => {
      const trial = createTrial()
      const {sandbox, host, ...runOptions} = await setup(trial)
      await host.fs.mkdir('/artifacts/test-id', {
        recursive: true,
      })
      await host.fs.writeFile('/artifacts/test-id/stale.txt', 'stale')
      mockRunCommand(sandbox)

      await run({
        ...runOptions,
        host,
        sandbox,
        trial,
      })

      expect(host.existsSync('/artifacts/test-id/stale.txt')).toBe(false)
      expect(host.existsSync('/artifacts/test-id/workspace')).toBe(true)
    })

    test('downloads the workspace results', async () => {
      const trial = createTrial()
      const {sandbox, host, ...runOptions} = await setup(trial)
      mockRunCommand(sandbox)

      const result = await run({
        ...runOptions,
        host,
        sandbox,
        trial,
      })

      await expect(host.fs.readFile(result.artifacts.testResultsPath, 'utf8')).resolves.toBe(
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

    test('preserves raw candidate usage without interpreting it', async () => {
      const trial = createTrial()
      const {sandbox, host, ...runOptions} = await setup(trial)
      const writeUsageArtifact: RunCommandMock = async ({params, sandbox: testSandbox}) => {
        const [command, args] = params
        if (command === 'copilot' && args?.[0] === '--prompt') {
          await testSandbox.writeFile(
            '/tmp/agent-eval-candidate/usage.json',
            '{"totalNanoAiu":123456789,"assistant":{"usage":{"inputTokens":10,"outputTokens":20}}}',
          )
        }
      }
      mockRunCommand(sandbox, [writeUsageArtifact])

      const result = await run({
        ...runOptions,
        execution: {
          captureWalkthrough: false,
        },
        host,
        sandbox,
        trial,
      })

      expect(result.artifacts.candidateUsagePath).toBe('/artifacts/test-id/attempts/1/candidate-usage.json')
      await expect(host.fs.readFile(result.artifacts.candidateUsagePath!, 'utf8')).resolves.toBe(
        '{"totalNanoAiu":123456789,"assistant":{"usage":{"inputTokens":10,"outputTokens":20}}}',
      )
    })

    test('leaves candidate usage unavailable when the CLI does not write it', async () => {
      const trial = createTrial()
      const {sandbox, host, ...runOptions} = await setup(trial)
      mockRunCommand(sandbox)

      const result = await run({
        ...runOptions,
        execution: {
          captureWalkthrough: false,
        },
        host,
        sandbox,
        trial,
      })

      expect(result.artifacts.candidateUsagePath).toBeUndefined()
      expect(host.existsSync('/artifacts/test-id/attempts/1/candidate-usage.json')).toBe(false)
    })

    test('redacts the execution token from persisted evidence and excludes credential stores', async () => {
      const trial = createTrial()
      const {sandbox, host, ...runOptions} = await setup(trial)
      const copilotToken = 'secret-token'
      await sandbox.writeFile(path.posix.join(COPILOT_DIR, 'config.json'), `config=${copilotToken}`)
      await sandbox.writeFile(path.posix.join(COPILOT_DIR, 'credentials.json'), copilotToken)
      const writeFile = vi.spyOn(host.fs, 'writeFile')
      const writeSensitiveArtifacts: RunCommandMock = async ({params, sandbox: testSandbox}) => {
        const [command, args] = params
        if (command === 'copilot' && args?.[0] === '--prompt') {
          await testSandbox.writeFile(
            '/tmp/agent-eval-candidate/usage.json',
            `{"totalNanoAiu":123,"diagnostic":"${copilotToken}"}`,
          )
          await testSandbox.writeFile('/tmp/agent-eval-candidate/logs/copilot.log', `log=${copilotToken}`)
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
            stdout: [
              JSON.stringify({
                type: 'unknown.event',
                data: {
                  output: copilotToken,
                },
              }),
              JSON.stringify(result),
            ].join('\n'),
            stderr: `stderr=${copilotToken}`,
            exitCode: 0,
          }
        }

        if (command === 'sh') {
          throw new Error(`grader leaked ${copilotToken}`)
        }
      }
      mockRunCommand(sandbox, [writeSensitiveArtifacts])

      let failure: TrialExecutionError | undefined
      try {
        await run({
          ...runOptions,
          copilotToken,
          execution: {
            captureWalkthrough: false,
          },
          host,
          sandbox,
          trial,
        })
      } catch (error) {
        if (error instanceof TrialExecutionError) {
          failure = error
        } else {
          throw error
        }
      }

      expect(failure?.failure.redactionApplied).toBe(true)
      expect(failure?.failure.error.message).toBe('grader leaked [REDACTED]')
      const persistedArtifactWrites = writeFile.mock.calls.filter(([filepath]) => {
        return typeof filepath === 'string' && filepath.startsWith('/artifacts/')
      })
      expect(persistedArtifactWrites.length).toBeGreaterThan(0)
      for (const [, contents] of persistedArtifactWrites) {
        const persisted = Buffer.isBuffer(contents) ? contents : Buffer.from(String(contents))
        expect(persisted.includes(Buffer.from(copilotToken))).toBe(false)
      }
      await expect(
        host.fs.readFile('/artifacts/test-id/attempts/1/candidate.stdout.log', 'utf8'),
      ).resolves.not.toContain(copilotToken)
      await expect(host.fs.readFile('/artifacts/test-id/attempts/1/candidate.stderr.log', 'utf8')).resolves.toBe(
        'stderr=[REDACTED]',
      )
      await expect(host.fs.readFile('/artifacts/test-id/attempts/1/candidate-usage.json', 'utf8')).resolves.toBe(
        '{"totalNanoAiu":123,"diagnostic":"[REDACTED]"}',
      )
      await expect(host.fs.readFile('/artifacts/test-id/attempts/1/candidate-logs/copilot.log', 'utf8')).resolves.toBe(
        'log=[REDACTED]',
      )
      await expect(host.fs.readFile('/artifacts/test-id/.copilot/config.json', 'utf8')).resolves.toBe(
        'config=[REDACTED]',
      )
      expect(host.existsSync('/artifacts/test-id/.copilot/credentials.json')).toBe(false)
      await expect(host.fs.readFile('/artifacts/test-id/attempts/1/redaction.json', 'utf8')).resolves.toContain(
        '"redactionApplied": true',
      )
    })

    test('downloads the Copilot configuration', async () => {
      const trial = createTrial()
      const {sandbox, host, ...runOptions} = await setup(trial)
      await host.fs.writeFile(path.join(COPILOT_DIR, 'config.json'), 'copilot config')
      mockRunCommand(sandbox)

      const result = await run({
        ...runOptions,
        host,
        sandbox,
        trial,
      })

      await expect(
        host.fs.readFile(path.join(result.artifacts.copilotConfigDirectory, 'config.json'), 'utf8'),
      ).resolves.toBe('copilot config')
    })

    test('downloads the agent configuration', async () => {
      const trial = createTrial()
      const {sandbox, host, ...runOptions} = await setup(trial)
      await host.fs.writeFile(path.join(AGENTS_DIR, 'AGENTS.md'), 'agent config')
      mockRunCommand(sandbox)

      const result = await run({
        ...runOptions,
        host,
        sandbox,
        trial,
      })

      await expect(
        host.fs.readFile(path.join(result.artifacts.skillsConfigDirectory, 'AGENTS.md'), 'utf8'),
      ).resolves.toBe('agent config')
    })

    test('excludes the walkthrough skill from the agent configuration', async () => {
      const trial = createTrial()
      const {sandbox, host, ...runOptions} = await setup(trial)
      const treatmentSkillPath = path.posix.join(SKILLS_DIR, 'treatment-skill', 'SKILL.md')
      await host.fs.mkdir(path.posix.dirname(treatmentSkillPath), {recursive: true})
      await host.fs.writeFile(treatmentSkillPath, 'treatment skill')
      mockRunCommand(sandbox, [manageAgentBrowserSkill(host)])

      const result = await run({
        ...runOptions,
        host,
        sandbox,
        trial,
      })

      expect(host.existsSync(path.join(result.artifacts.skillsConfigDirectory, 'skills', 'agent-browser'))).toBe(false)
      await expect(
        host.fs.readFile(
          path.join(result.artifacts.skillsConfigDirectory, 'skills', 'treatment-skill', 'SKILL.md'),
          'utf8',
        ),
      ).resolves.toBe('treatment skill')
    })

    test('downloads the walkthrough', async () => {
      const trial = createTrial()
      const {sandbox, host, ...runOptions} = await setup(trial)
      mockRunCommand(sandbox, [writeWalkthroughArtifact('walkthrough/screenshot.png', 'screenshot')])

      const result = await run({
        ...runOptions,
        host,
        sandbox,
        trial,
      })

      expect(result.walkthrough).toEqual({
        type: 'Screenshot',
        filepath: '/artifacts/test-id/walkthrough/screenshot.png',
      })
      await expect(host.fs.readFile('/artifacts/test-id/walkthrough/screenshot.png', 'utf8')).resolves.toBe(
        'screenshot',
      )
      expect(host.existsSync('/artifacts/test-id/workspace/walkthrough')).toBe(false)
    })

    test('persists successful attempt metadata and result before aggregate output is written', async () => {
      const trial = createTrial()
      const {sandbox, host, ...runOptions} = await setup(trial)
      mockRunCommand(sandbox)

      await run({
        ...runOptions,
        execution: {
          captureWalkthrough: false,
        },
        host,
        sandbox,
        trial,
      })

      await expect(host.fs.readFile('/artifacts/test-id/attempts/1/attempt.json', 'utf8')).resolves.toContain(
        '"status": "succeeded"',
      )
      await expect(host.fs.readFile('/artifacts/test-id/attempts/1/result.json', 'utf8')).resolves.toContain(
        '"id":"test-id"',
      )
    })
  })
})
