import path from 'node:path'
import {describe, expect, test, vi} from 'vitest'
import {VirtualHost} from './host'
import {AGENTS_DIR, CONTAINER_WORKDIR, COPILOT_DIR, NODE_USER, type CommandResult, type Sandbox} from './sandbox'
import {run} from './trial'
import type {Trial} from './trial'
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
  if (command === 'sh' && Array.isArray(args) && args[0] === '-c' && args[1].startsWith('npx vitest run')) {
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

describe('run', () => {
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
      exclude: ['scenario.config.ts', 'scenario.test.ts', 'scenario.browser.test.ts', 'node_modules', '.next', 'dist'],
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
        '--output-format',
        'json',
      ],
      {
        user: NODE_USER,
        env: {
          COPILOT_GITHUB_TOKEN: copilotToken,
        },
      },
    )
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
      'sh',
      [
        '-c',
        'npx vitest run --config "$1" "$2" || true',
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
  })
})
