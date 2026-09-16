import Queue from 'p-queue'
import {expect, test, vi} from 'vitest'
import {VirtualHost} from '../host'
import {AGENTS_DIR, CONTAINER_WORKDIR, COPILOT_DIR, NODE_USER, VirtualSandbox, type Sandbox} from '../sandbox'
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

test.each([
  undefined,
  {source: 'image', image: 'project:latest'},
  {source: 'image', dockerfile: './Dockerfile'},
] as const)('prepares only scenario-backed workspaces and still evaluates image workspaces: %j', async workspace => {
  const host = VirtualHost.create({
    '/scenarios/example/package.json': '{"name":"local-scenario"}',
    '/scenarios/example/local-only.txt': 'not part of the image',
    '/scenarios/example/scenario.test.ts': 'private check',
    '/scenarios/example/reference.txt': 'private judge reference',
    [`${CONTAINER_WORKDIR}/package.json`]: '{"name":"image-project"}',
    [`${CONTAINER_WORKDIR}/apps/web/index.js`]: 'image source',
    [`${CONTAINER_WORKDIR}/node_modules/example/index.js`]: 'installed dependency',
    [`${COPILOT_DIR}/config.json`]: '{}',
    [`${AGENTS_DIR}/config.json`]: '{}',
  })
  await using sandbox: Sandbox = await VirtualSandbox.create({host})
  const copy = vi.spyOn(sandbox, 'copy')
  const setup = vi.fn(async () => {})
  const treatmentSetup = vi.fn(async () => {})
  const check = vi.fn(async () => {
    await expect(sandbox.readFile('scenario.test.ts')).resolves.toBe('private check')
    return [{type: 'outcomes' as const, outcomes: [{type: 'outcome' as const, status: 'passed' as const}]}]
  })
  const trial: Trial = {
    id: 'trial',
    model: {name: 'gpt-5.5', reasoningEffort: 'high'},
    setup,
    treatment: {...ControlTreatment, setup: treatmentSetup},
    scenario: {
      id: 'example',
      directory: '/scenarios/example',
      prompt: 'Update the image project',
      workspace,
      tags: [],
      checks: [
        {
          name: 'check',
          files: [{filepath: '/scenarios/example/scenario.test.ts', relativePath: 'scenario.test.ts'}],
          run: check,
        },
      ],
      judges: [],
    },
  }
  const runCommand = vi.spyOn(sandbox, 'runCommand').mockImplementation(async (command, args = []) => {
    if (command === 'copilot' && args.includes(trial.scenario.prompt)) {
      await expect(sandbox.exists('scenario.test.ts')).resolves.toBe(false)
      await expect(sandbox.readFile('apps/web/index.js')).resolves.toBe('image source')
      await expect(sandbox.readFile('node_modules/example/index.js')).resolves.toBe('installed dependency')
      await expect(sandbox.readFile('package.json')).resolves.toBe(
        workspace ? '{"name":"image-project"}' : '{"name":"local-scenario"}',
      )
      await expect(sandbox.exists('local-only.txt')).resolves.toBe(!workspace)
      expect(setup).toHaveBeenCalledOnce()
      expect(treatmentSetup).toHaveBeenCalledOnce()
    }
    return {
      exitCode: 0,
      stderr: '',
      stdout:
        command === 'copilot'
          ? JSON.stringify({
              type: 'result',
              timestamp: '2026-09-16T00:00:00.000Z',
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

  await runTrial({
    artifactsDirectory: '/artifacts',
    copilotQueue: new Queue({concurrency: 1}),
    copilotToken: 'test-token',
    host,
    sandbox,
    trial,
  })

  expect(check).toHaveBeenCalledOnce()
  expect(copy).toHaveBeenCalledWith('/scenarios/example/scenario.test.ts', 'scenario.test.ts')
  expect(
    copy.mock.calls.some(([source]) => {
      return source === '/scenarios/example'
    }),
  ).toBe(!workspace)
  for (const args of [
    ['pkg', 'set', 'name=trial'],
    ['pkg', 'delete', 'devDependencies.@primer/agent-eval'],
    ['install'],
    ['run', 'build', '--if-present'],
  ]) {
    if (workspace) {
      expect(runCommand).not.toHaveBeenCalledWith('npm', args, {user: NODE_USER})
    } else {
      expect(runCommand).toHaveBeenCalledWith('npm', args, {user: NODE_USER})
    }
  }
})
