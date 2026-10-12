import {expect, test, vi} from 'vitest'
import type {CopilotRunner} from './copilot-runner'
import {runPlan, selectPlanTrials} from './plan'
import {VirtualHost} from './host'
import {AGENTS_DIR, COPILOT_DIR} from './sandbox'
import {ControlTreatment} from './treatment'
import type {Trial} from './trial/trial'
import {getTrialArtifacts} from './trial/run'
import {createTrialSummary, addTrialResultToSummary} from './trial/report'

test('runPlan redacts the supplied token from persisted errors', async () => {
  const host = createRunHost()
  const trial = createRunTrial('failed', async () => {
    throw new Error('Rejected test-token')
  })

  const {results} = await runTrials(host, [trial])

  expect(results[0].result.error?.message).toBe('Rejected [REDACTED]')
  expect(await host.fs.promises.readFile('/results/artifacts/.checkpoints/failed.json', 'utf-8')).not.toContain(
    'test-token',
  )
})

test.each(['../outside', '/absolute', '..', '.checkpoints', 'nested/trial', 'nested\\trial'])(
  'runPlan rejects an unsafe trial ID before execution: %s',
  async id => {
    const host = createRunHost()
    const setup = vi.fn(async () => {})

    await expect(runTrials(host, [createRunTrial(id, setup)])).rejects.toThrow()
    expect(setup).not.toHaveBeenCalled()
  },
)

test('runPlan rejects checkpoint reuse for a different capability', async () => {
  const host = createRunHost()
  const trial = {...createRunTrial('successful'), capability: {id: 'components'}}
  await runTrials(host, [trial])

  await expect(runTrials(host, [{...trial, capability: {id: 'layout'}}], true)).rejects.toThrow(
    'Saved result does not match trial: successful',
  )
})

vi.mock('./scenario/scenario', async importOriginal => {
  const original = await importOriginal<typeof import('./scenario/scenario')>()
  return {
    ...original,
    buildScenarioImage: async () => ({tagName: 'test-image'}),
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

function createRunTrial(id: string, setup?: Trial['setup']): Trial {
  return {
    id,
    setup,
    model: {name: 'gpt-5.5', reasoningEffort: 'medium'},
    runner: 'copilot-cli',
    treatment: ControlTreatment,
    scenario: {
      id: 'example',
      directory: '/scenarios/example',
      prompt: 'Create a page',
      tags: [],
      checks: [],
      judges: [],
      image: {type: 'Default'},
    },
  }
}

function createRunHost() {
  const host = VirtualHost.create({
    [`${COPILOT_DIR}/config.json`]: '{}',
    [`${AGENTS_DIR}/config.json`]: '{}',
  })
  const createSandbox = host.createSandbox.bind(host)
  vi.spyOn(host, 'createSandbox').mockImplementation(async options => {
    const sandbox = await createSandbox(options)
    const runCommand = sandbox.runCommand.bind(sandbox)
    vi.spyOn(sandbox, 'runCommand').mockImplementation(async (command, args = [], commandOptions) => {
      const usageIndex = args.indexOf('--usage-output-file')
      if (usageIndex !== -1) {
        await sandbox.writeFile(args[usageIndex + 1], JSON.stringify({modelMetrics: {}}))
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
      return runCommand(command, args, commandOptions)
    })
    return sandbox
  })
  return host
}

function runTrials<T extends Trial>(host: VirtualHost, trials: Array<T>, resume = false) {
  return runPlan({
    host,
    plan: {trials},
    artifactsDirectory: '/results/artifacts',
    copilotToken: 'test-token',
    copilotConcurrency: 1,
    containerConcurrency: 1,
    resume,
  })
}

test('runPlan captures exhausted failures without losing successful trials', async () => {
  const host = createRunHost()
  const failed = createRunTrial('failed', async () => {
    throw new TypeError('Setup failed')
  })
  const successful = createRunTrial('successful')

  const {results} = await runTrials(host, [failed, successful])

  expect(results.map(({trial}) => trial.id)).toEqual(['failed', 'successful'])
  expect(results[0].result.error).toEqual({name: 'TypeError', message: 'Setup failed'})
  expect(results[1].result.error).toBeUndefined()
  for (const {trial} of results) {
    const checkpoint = JSON.parse(
      await host.fs.promises.readFile(`/results/artifacts/.checkpoints/${trial.id}.json`, 'utf-8'),
    )
    expect(checkpoint.identity.id).toBe(trial.id)
  }
  const summary = createTrialSummary()
  for (const {result} of results) {
    addTrialResultToSummary(summary, result)
  }
  expect(summary.runs).toBe(1)
  expect(summary.errors).toBe(1)
})

test('runPlan resumes successful trials and retries failed and missing trials with their saved IDs', async () => {
  const host = createRunHost()
  let fail = true
  const executed: Array<string> = []
  const successful = createRunTrial('successful', async () => {
    executed.push('successful')
  })
  const failed = createRunTrial('failed', async () => {
    executed.push('failed')
    if (fail) {
      throw new Error('Temporary failure')
    }
  })
  const initial = await runTrials(host, [successful, failed])
  const saved = await host.fs.promises.readFile('/results/artifacts/.checkpoints/successful.json', 'utf-8')
  executed.length = 0
  fail = false
  const missing = createRunTrial('missing', async () => {
    executed.push('missing')
  })

  const resumed = await runTrials(host, [successful, failed, missing], true)

  expect(executed).toEqual(['failed', 'missing'])
  expect(resumed.results[0]).toEqual(initial.results[0])
  expect(resumed.results.map(({result}) => result.error)).toEqual([undefined, undefined, undefined])
  expect(await host.fs.promises.readFile('/results/artifacts/.checkpoints/successful.json', 'utf-8')).toBe(saved)
})

test('runPlan checkpoints a completed trial before the whole plan finishes', async () => {
  const host = createRunHost()
  let release: () => void = () => {}
  const blocked = new Promise<void>(resolve => {
    release = resolve
  })
  const successful = createRunTrial('successful')
  const pending = createRunTrial('pending', async () => {
    await blocked
  })
  const written = new Promise<void>(resolve => {
    const rename = host.fs.promises.rename.bind(host.fs.promises)
    vi.spyOn(host.fs.promises, 'rename').mockImplementation(async (from, to) => {
      await rename(from, to)
      if (to === '/results/artifacts/.checkpoints/successful.json') {
        resolve()
      }
    })
  })
  const running = runTrials(host, [successful, pending])

  try {
    await written
    const checkpoint = JSON.parse(
      await host.fs.promises.readFile('/results/artifacts/.checkpoints/successful.json', 'utf-8'),
    )
    expect(checkpoint.result.error).toBeUndefined()
  } finally {
    release()
    await running
  }
})

test('runPlan rejects mismatched checkpoints before running any trials', async () => {
  const host = createRunHost()
  const trial = createRunTrial('successful')
  await runTrials(host, [trial])
  const setup = vi.fn(async () => {})
  const changed = {...trial, model: {...trial.model, reasoningEffort: 'high' as const}, setup}

  await expect(runTrials(host, [createRunTrial('missing', setup), changed], true)).rejects.toThrow(
    'Saved result does not match trial: successful',
  )
  expect(setup).not.toHaveBeenCalled()
})

test('runPlan rejects corrupt checkpoints rather than overwriting completed work', async () => {
  const host = createRunHost()
  await host.fs.promises.mkdir('/results/artifacts/.checkpoints', {recursive: true})
  await host.fs.promises.writeFile('/results/artifacts/.checkpoints/successful.json', '{')

  await expect(runTrials(host, [createRunTrial('successful')], true)).rejects.toThrow()
  expect(await host.fs.promises.readFile('/results/artifacts/.checkpoints/successful.json', 'utf-8')).toBe('{')
})

test('runPlan records sandbox creation errors and non-Error rejections', async () => {
  const host = createRunHost()
  vi.spyOn(host, 'createSandbox').mockRejectedValue('Sandbox unavailable')

  const {results} = await runTrials(host, [createRunTrial('failed')])

  expect(results[0].result.error).toEqual({name: 'Error', message: 'Sandbox unavailable'})
  expect(results[0].result.artifacts).toEqual(getTrialArtifacts('/results/artifacts', 'failed'))
})
