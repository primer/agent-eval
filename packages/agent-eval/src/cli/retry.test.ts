import {afterEach, expect, test, vi} from 'vitest'
import {VirtualHost} from '../host'
import * as planModule from '../plan'
import {RunTrialResultSchema, type RunTrialResult} from '../trial/run'
import type {Trial} from '../trial/trial'
import {getBenchmark} from '../benchmark/get'
import {createBenchmarkPlan} from '../benchmark/plan'
import {createBenchmarkOutput, writeBenchmarkOutput} from '../benchmark/output'
import {getExperiment} from '../experiment/get'
import {createExperimentPlan} from '../experiment/plan'
import {createExperimentOutput, writeExperimentOutput} from '../experiment/output'
import {retryEvaluation} from './retry'

afterEach(() => {
  vi.restoreAllMocks()
})

function success(trial: Trial, directory = `/original/artifacts/${trial.id}`): RunTrialResult {
  return RunTrialResultSchema.parse({
    type: 'success',
    trial,
    agent: {
      sessions: [],
    },
    artifacts: {
      directory,
      copilotConfigDirectory: `${directory}/copilot`,
      skillsConfigDirectory: `${directory}/skills`,
      walkthroughDirectory: `${directory}/walkthrough`,
      workspaceDirectory: `${directory}/workspace`,
    },
    checks: [
      {
        check: {name: 'tests', files: []},
        result: {
          type: 'outcomes',
          outcomes: [{type: 'outcome', status: 'failed'}],
        },
      },
    ],
    judges: [],
    walkthrough: {
      type: 'Unavailable',
    },
  })
}

async function createFixture(
  kind: 'benchmark' | 'scenario experiment' | 'benchmark experiment',
  allSuccessful = false,
) {
  const host = VirtualHost.create({
    '/benchmarks/example.ts': `export default ${JSON.stringify({
      name: 'Example benchmark',
      description: 'Compare treatments',
      models: ['gpt-5.5'],
      runners: ['copilot-cli', 'copilot-sdk'],
      capabilities: [{name: 'Components', scenarios: ['example']}],
    })}`,
    '/experiments/example.ts': `export default ${JSON.stringify({
      name: 'Example experiment',
      description: 'Compare treatments',
      models: ['gpt-5.5'],
      runners: ['copilot-cli', 'copilot-sdk'],
      ...(kind === 'benchmark experiment' ? {benchmark: 'example'} : {scenarios: ['example']}),
      treatments: [{name: 'Skill'}],
    })}`,
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {prompt: "Build a page"}',
  })
  const options = {
    type: kind === 'benchmark' ? 'benchmark' : 'experiment',
    host,
    benchmarksDirectory: '/benchmarks',
    experimentsDirectory: '/experiments',
    scenariosDirectory: '/scenarios',
    outputDirectory: '/results',
    copilotConcurrency: 2,
    containerConcurrency: 3,
    token: 'test-token',
  } as const
  function results<T extends Trial>(trials: Array<T>) {
    return trials.map((trial, index) => {
      const entry = {...trial, id: `trial-${index}`}
      return {
        trial: entry,
        result:
          index === 0 || allSuccessful
            ? success(entry)
            : RunTrialResultSchema.parse({
                type: 'error',
                error: {
                  name: 'Error',
                  message: 'Original failure',
                },
              }),
      }
    })
  }
  if (kind === 'benchmark') {
    const benchmark = await getBenchmark({...options, name: 'example'})
    const plan = createBenchmarkPlan({benchmark})
    await writeBenchmarkOutput({
      host,
      output: createBenchmarkOutput({benchmark, runPlanResult: {results: results(plan.trials)}}),
      outputPath: '/original/output.json',
    })
  } else {
    const experiment = await getExperiment({...options, name: 'example'})
    const plan = createExperimentPlan({experiment})
    await writeExperimentOutput({
      host,
      output: createExperimentOutput({experiment, runPlanResult: {results: results(plan.trials)}}),
      outputPath: '/original/output.json',
    })
  }
  await host.fs.promises.writeFile('/original/artifacts/trial-0/evidence.txt', 'Keep this evidence')
  await host.fs.promises.rename('/original', '/results')
  return {host, options}
}

test.each(['benchmark', 'scenario experiment', 'benchmark experiment'] as const)(
  'retryEvaluation repairs a relocated %s bundle without rewriting completed trials',
  async kind => {
    const {host, options} = await createFixture(kind)
    const before = await host.fs.promises.readFile('/results/output.json', 'utf-8')
    const manifest = JSON.parse(before)
    const preserved = await host.fs.promises.readFile('/results/artifacts/trial-0/trial-0.json', 'utf-8')
    const run = vi.spyOn(planModule, 'runPlan').mockImplementation(async ({plan, artifactsDirectory}) => {
      return {
        results: plan.trials.map(trial => {
          return {
            trial,
            result: success(trial, `${artifactsDirectory}/${trial.id}`),
          }
        }),
      }
    })

    const report = await retryEvaluation(options)

    expect(report).not.toContain('Status: Incomplete')
    expect(run).toHaveBeenCalledOnce()
    expect(run.mock.calls[0][0]).toMatchObject({
      copilotConcurrency: 2,
      containerConcurrency: 3,
      copilotToken: 'test-token',
      artifactsDirectory: '/results/artifacts',
    })
    const selected = run.mock.calls[0][0].plan.trials
    expect(
      selected.map(trial => {
        return trial.id
      }),
    ).toEqual(Object.keys(manifest.trials).slice(1))
    for (const trial of selected) {
      const output = JSON.parse(await host.fs.promises.readFile(`/results/${manifest.trials[trial.id]}`, 'utf-8'))
      expect(output).toMatchObject({
        type: 'success',
        id: trial.id,
        model: trial.model,
        runner: trial.runner,
        scenarioId: trial.scenario.id,
        treatmentId: trial.treatment.id,
        ...(kind !== 'scenario experiment' ? {capabilityId: Object.keys(manifest.capabilities)[0]} : {}),
        artifacts: {
          directory: `artifacts/${trial.id}`,
        },
      })
    }
    expect(await host.fs.promises.readFile('/results/output.json', 'utf-8')).toBe(before)
    expect(await host.fs.promises.readFile('/results/artifacts/trial-0/trial-0.json', 'utf-8')).toBe(preserved)
    expect(await host.fs.promises.readFile('/results/artifacts/trial-0/evidence.txt', 'utf-8')).toBe(
      'Keep this evidence',
    )
    expect(host.fs.existsSync('/original')).toBe(false)
    expect(await retryEvaluation(options)).toBe('No failed trials to retry.')
    expect(run).toHaveBeenCalledOnce()
  },
)

test.each(['benchmark', 'scenario experiment', 'benchmark experiment'] as const)(
  'retryEvaluation preserves remaining errors and retries only those on the next %s recovery',
  async kind => {
    const {host, options} = await createFixture(kind)
    const run = vi.spyOn(planModule, 'runPlan').mockImplementation(async ({plan, artifactsDirectory}) => {
      return {
        results: plan.trials.map((trial, index) => {
          return {
            trial,
            result:
              index === 0
                ? success(trial, `${artifactsDirectory}/${trial.id}`)
                : RunTrialResultSchema.parse({
                    type: 'error',
                    error: {
                      name: 'TypeError',
                      message: 'Still unavailable',
                    },
                  }),
          }
        }),
      }
    })

    const report = await retryEvaluation(options)
    const completed = run.mock.calls[0][0].plan.trials[0].id
    const remaining = run.mock.calls[0][0].plan.trials.slice(1).map(trial => {
      return trial.id
    })
    const error = JSON.parse(
      await host.fs.promises.readFile(`/results/artifacts/${remaining[0]}/${remaining[0]}.json`, 'utf-8'),
    )
    const secondReport = await retryEvaluation(options)

    expect(report).toContain('Status: Incomplete')
    expect(report).toContain('Still unavailable')
    expect(error).toMatchObject({
      type: 'error',
      error: {name: 'TypeError', message: 'Still unavailable'},
    })
    expect(
      run.mock.calls[1][0].plan.trials.map(trial => {
        return trial.id
      }),
    ).toEqual(remaining)
    expect(
      run.mock.calls[1][0].plan.trials.map(trial => {
        return trial.id
      }),
    ).not.toContain(completed)
    expect(secondReport).toContain('Status: Incomplete')
  },
)

test.each(['benchmark', 'scenario experiment', 'benchmark experiment'] as const)(
  'retryEvaluation is a no-op without configuration or a token for completed %s results',
  async kind => {
    const {host, options} = await createFixture(kind, true)
    await host.fs.promises.unlink('/benchmarks/example.ts')
    await host.fs.promises.unlink('/experiments/example.ts')
    const run = vi.spyOn(planModule, 'runPlan')

    const report = await retryEvaluation({...options, token: undefined})

    expect(report).toBe('No failed trials to retry.')
    expect(run).not.toHaveBeenCalled()
  },
)

test.each(['benchmark', 'scenario experiment', 'benchmark experiment'] as const)(
  'retryEvaluation rejects unresolved original dimensions before changing %s results',
  async kind => {
    const {host, options} = await createFixture(kind)
    const filepath = '/results/artifacts/trial-1/trial-1.json'
    const output = JSON.parse(await host.fs.promises.readFile(filepath, 'utf-8'))
    await host.fs.promises.writeFile(filepath, JSON.stringify({...output, treatmentId: 'removed-treatment'}))
    const before = host.vol.toJSON()
    const run = vi.spyOn(planModule, 'runPlan')

    await expect(retryEvaluation(options)).rejects.toThrow('Treatment not found for trial: trial-1')

    expect(run).not.toHaveBeenCalled()
    expect(host.vol.toJSON()).toEqual(before)
  },
)
