import Queue from 'p-queue'
import {expect, test, vi} from 'vitest'
import {VirtualHost} from '../host'
import {AGENTS_DIR, COPILOT_DIR, VirtualSandbox, type Sandbox} from '../sandbox'
import {ControlTreatment} from '../treatment'
import {runTrial} from './run'
import type {Trial} from './trial'

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
    let taskCalls = 0
    let sessionId = 'session'
    const checkRun = vi.fn<Trial['scenario']['checks'][number]['run']>(async ({sandbox: checkSandbox}) => {
      expect(taskCalls).toBe(1)
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
        prompt: [
          {
            prompt: 'Update the example',
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
            judges: [],
          },
          'Add search',
        ],
        tags: [],
        judges: [],
        image: {type: 'Default'},
        checks: [],
      },
    }
    const copilotQueue = new Queue({concurrency: 1})
    vi.spyOn(sandbox, 'runCommand').mockImplementation(async (command, args = []) => {
      if (command === 'rm' && args[0] === '-rf') {
        await Promise.all(
          args.slice(1).map(relativePath => {
            return host.fs.promises.rm(`/home/sandbox/workspace/${relativePath}`, {recursive: true, force: true})
          }),
        )
      }

      if (
        (command === '/opt/agent-eval/copilot/bin/copilot' &&
          trial.scenario.prompt.some(prompt => (typeof prompt === 'string' ? prompt : prompt.prompt) === args[1])) ||
        (command === '/opt/agent-eval/node/bin/node' && args[0] === '/opt/agent-eval/sdk-runner/run.cjs')
      ) {
        taskCalls++
        expect(copilotQueue.pending).toBe(1)
        expect(command).toBe(
          runner === 'copilot-sdk' ? '/opt/agent-eval/node/bin/node' : '/opt/agent-eval/copilot/bin/copilot',
        )
        if (runner === 'copilot-sdk') {
          const runnerConfig = JSON.parse(await sandbox.readFile(args[1]))
          expect(runnerConfig).toMatchObject({
            model: trial.model.name,
            reasoningEffort: trial.model.reasoningEffort,
            prompt: [taskCalls === 1 ? 'Update the example' : 'Add search'],
            resume: taskCalls > 1,
          })
          if (taskCalls === 1) {
            expect(runnerConfig.sessionId).toEqual(expect.any(String))
          } else {
            expect(runnerConfig.sessionId).toBe(sessionId)
          }
          sessionId = runnerConfig.sessionId
        } else {
          expect(args[1]).toBe(taskCalls === 1 ? 'Update the example' : 'Add search')
          if (taskCalls > 1) {
            expect(args).toContain('--resume')
            expect(args[args.indexOf('--resume') + 1]).toBe('session')
          }
          const usagePath = args[args.indexOf('--usage-output-file') + 1]
          await sandbox.writeFile(
            usagePath,
            JSON.stringify({modelMetrics: {'gpt-5.5': {usage: {outputTokens: 42 * taskCalls}}}}),
          )
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
                sessionId,
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

    expect(taskCalls).toBe(2)
    expect(result.agent.sessions[0].outputTokens).toBe(runner === 'copilot-cli' ? 84 : 0)
    expect(sandbox.runCommand).toHaveBeenCalledWith(
      'npm',
      ['install', '-g', '--prefix', '/home/node/.npm-global', '--allow-scripts=agent-browser', 'agent-browser'],
      {user: '1000:1000'},
    )
    expect(checkRun).toHaveBeenCalledOnce()
    expect(result.checks[0]?.result).toEqual({
      type: 'outcomes',
      outcomes: [{type: 'outcome', status: 'passed'}],
    })
  },
)
