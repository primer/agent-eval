import {Readable} from 'node:stream'
import {expect, test, vi} from 'vitest'
import type {CopilotRunner} from './copilot-runner'
import {VirtualHost} from './host'
import {createPlanFromManifest, PlanRunError, runPlan, selectPlanTrials} from './plan'
import {AGENTS_DIR, COPILOT_DIR, VirtualSandbox, type Sandbox} from './sandbox'
import {ControlTreatment} from './treatment'
import {TRIAL_COMMIT_FILENAME} from './trial/store'
import type {Trial} from './trial/trial'

vi.mock('./docker', async importOriginal => {
  const original = await importOriginal<typeof import('./docker')>()
  return {
    ...original,
    buildImage: vi.fn<typeof original.buildImage>(async (context, options) => {
      await Readable.from(context).toArray()
      return {tagName: options.t}
    }),
  }
})

function createTrials() {
  const runners: Array<CopilotRunner> = ['copilot-cli', 'copilot-sdk', 'copilot-sdk', 'copilot-cli']
  return runners.map((runner, index) => {
    return {
      id: `trial-${index}`,
      runner,
    }
  })
}

test('selectPlanTrials preserves every runner and saved trial order by default', () => {
  const trials = createTrials()

  const selected = selectPlanTrials({
    trials,
  })

  expect(selected).toEqual(trials)
})

test('selectPlanTrials selects a runner without changing trial order', () => {
  const trials = createTrials()

  const selected = selectPlanTrials({
    trials,
    runner: 'copilot-sdk',
  })

  expect(selected).toEqual([trials[1], trials[2]])
})

test('selectPlanTrials selects a shard across all runners', () => {
  const trials = createTrials()

  const selected = selectPlanTrials({
    trials,
    shard: {
      order: 1,
      total: 2,
    },
  })

  expect(selected).toEqual([trials[0], trials[2]])
})

test('selectPlanTrials assigns shards before filtering by runner', () => {
  const trials = createTrials()

  const selected = selectPlanTrials({
    trials,
    runner: 'copilot-sdk',
    shard: {
      order: 1,
      total: 2,
    },
  })

  expect(selected).toEqual([trials[2]])
})

test('selectPlanTrials allows a shard without trials for a runner present in the full plan', () => {
  const trials = createTrials()

  const selected = selectPlanTrials({
    trials,
    runner: 'copilot-sdk',
    shard: {
      order: 1,
      total: 4,
    },
  })

  expect(selected).toEqual([])
})

test('selectPlanTrials rejects a runner absent from the full plan, even when the shard is empty', () => {
  const trials = createTrials().filter(trial => {
    return trial.runner === 'copilot-cli'
  })

  expect(() => {
    selectPlanTrials({
      trials,
      runner: 'copilot-sdk',
      shard: {
        order: 4,
        total: 4,
      },
    })
  }).toThrow(
    'No trials found for runner "copilot-sdk" in the saved plan. Add "copilot-sdk" to the configuration\'s runners and create a new plan.',
  )
})

const OUTPUT_DIRECTORY = '/results'

function createTrial(id: string): Trial {
  return {
    id,
    model: {name: 'gpt-5.5', reasoningEffort: 'high'},
    runner: 'copilot-sdk',
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
}

function stubCommands(sandbox: Sandbox) {
  vi.spyOn(sandbox, 'runCommand').mockImplementation(async (command, args = []) => {
    if (args.includes('--usage-output-file')) {
      await sandbox.writeFile(args[args.indexOf('--usage-output-file') + 1], '{"modelMetrics":{}}')
    }
    if (command === '/opt/agent-eval/node/bin/node') {
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
}

function createPlanFixture() {
  const host = VirtualHost.create({
    '/scenarios/example/package.json': '{}',
    '/home/sandbox/workspace/package.json': '{}',
    [`${COPILOT_DIR}/config.json`]: '{}',
    [`${AGENTS_DIR}/config.json`]: '{}',
  })
  const createSandbox = vi.spyOn(host, 'createSandbox').mockImplementation(async () => {
    const sandbox = await VirtualSandbox.create({host})
    stubCommands(sandbox)
    return sandbox
  })

  return {
    host,
    createSandbox,
    run(trials: Array<Trial>, resume?: boolean) {
      return runPlan({
        copilotConcurrency: 1,
        containerConcurrency: 1,
        copilotToken: 'test-token',
        host,
        outputDirectory: OUTPUT_DIRECTORY,
        plan: createPlanFromManifest({trials}),
        resume,
      })
    },
  }
}

test('runPlan with resume reuses committed trials and runs only the remaining trials', async () => {
  const fixture = createPlanFixture()
  const saved = createTrial('saved')
  await fixture.run([saved])
  fixture.host.fs.writeFileSync(`${OUTPUT_DIRECTORY}/artifacts/saved/marker.txt`, 'committed')
  fixture.createSandbox.mockClear()
  const savedSetup = vi.fn()
  saved.setup = savedSetup
  const remaining = createTrial('remaining')

  const {results} = await fixture.run([saved, remaining], true)

  expect(savedSetup).not.toHaveBeenCalled()
  expect(fixture.createSandbox).toHaveBeenCalledOnce()
  expect(results.map(({trial}) => trial)).toEqual([saved, remaining])
  expect(results[0].result.artifacts.directory).toBe(`${OUTPUT_DIRECTORY}/artifacts/saved`)
  expect(fixture.host.fs.readFileSync(`${OUTPUT_DIRECTORY}/artifacts/saved/marker.txt`, 'utf8')).toBe('committed')
  expect(fixture.host.fs.existsSync(`${OUTPUT_DIRECTORY}/artifacts/remaining/${TRIAL_COMMIT_FILENAME}`)).toBe(true)
})

test('runPlan without resume runs committed trials again and replaces their artifacts', async () => {
  const fixture = createPlanFixture()
  const trial = createTrial('trial')
  await fixture.run([trial])
  fixture.host.fs.writeFileSync(`${OUTPUT_DIRECTORY}/artifacts/trial/marker.txt`, 'previous run')
  fixture.createSandbox.mockClear()

  await fixture.run([trial])

  expect(fixture.createSandbox).toHaveBeenCalledOnce()
  expect(fixture.host.fs.existsSync(`${OUTPUT_DIRECTORY}/artifacts/trial/marker.txt`)).toBe(false)
  expect(fixture.host.fs.existsSync(`${OUTPUT_DIRECTORY}/artifacts/trial/${TRIAL_COMMIT_FILENAME}`)).toBe(true)
})

test('runPlan retries a failing trial, disposes every attempt, and rejects after siblings commit', async () => {
  const fixture = createPlanFixture()
  const error = new Error('setup failed')
  const attemptSandboxes: Array<Sandbox> = []
  const disposals: Array<Sandbox> = []
  fixture.createSandbox.mockImplementation(async () => {
    const sandbox = await VirtualSandbox.create({host: fixture.host})
    stubCommands(sandbox)
    vi.spyOn(sandbox, Symbol.asyncDispose).mockImplementation(async () => {
      disposals.push(sandbox)
    })
    return sandbox
  })
  const failing = createTrial('failing')
  failing.setup = async ({sandbox}) => {
    attemptSandboxes.push(sandbox)
    throw error
  }
  const passing = createTrial('passing')

  const result = await fixture.run([failing, passing]).catch((rejection: unknown) => rejection)

  expect(result).toBeInstanceOf(PlanRunError)
  expect((result as PlanRunError).failures.map(failure => failure.trialId)).toEqual(['failing'])
  expect((result as PlanRunError).message).toContain('failing')
  expect(attemptSandboxes).toHaveLength(4)
  expect(new Set(attemptSandboxes).size).toBe(4)
  expect(disposals).toEqual(expect.arrayContaining(attemptSandboxes))
  expect(fixture.host.fs.existsSync(`${OUTPUT_DIRECTORY}/artifacts/failing`)).toBe(false)
  expect(fixture.host.fs.existsSync(`${OUTPUT_DIRECTORY}/artifacts/passing/${TRIAL_COMMIT_FILENAME}`)).toBe(true)
})
