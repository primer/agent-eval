import {expect, test} from 'vitest'
import {VirtualHost} from '../host'
import type {RunPlanResult} from '../plan'
import {RunTrialResultSchema} from '../trial/run'
import {getBenchmark} from './get'
import {createBenchmarkPlan, type BenchmarkTrial} from './plan'
import {createBenchmarkReport} from './report'

async function createBenchmark() {
  const host = VirtualHost.create({
    '/benchmarks/example.ts':
      'export default {name: "Example", description: "Compare treatments", models: ["gpt-5.5"], capabilities: [{name: "Components", scenarios: ["example"]}]}',
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {prompt: "Build a page"}',
  })
  return getBenchmark({
    host,
    name: 'example',
    benchmarksDirectory: '/benchmarks',
    scenariosDirectory: '/scenarios',
  })
}

function createResult(trial: BenchmarkTrial, failed = false): RunPlanResult<BenchmarkTrial>['results'][number] {
  return {
    trial,
    result: RunTrialResultSchema.parse(
      failed
        ? {
            type: 'error',
            error: {
              name: 'Error',
              message: 'Setup failed',
            },
          }
        : {
            type: 'success',
            trial,
            agent: {
              sessions: [],
            },
            artifacts: {
              directory: '/artifacts',
              copilotConfigDirectory: '/artifacts/copilot',
              skillsConfigDirectory: '/artifacts/skills',
              walkthroughDirectory: '/artifacts/walkthrough',
              workspaceDirectory: '/artifacts/workspace',
            },
            checks: [
              {
                check: {
                  name: 'Quality',
                  files: [],
                },
                result: {
                  type: 'outcomes',
                  outcomes: [
                    {
                      type: 'outcome',
                      status: 'failed',
                      annotations: [],
                    },
                  ],
                },
              },
            ],
            judges: [],
            walkthrough: {
              type: 'Unavailable',
            },
          },
    ),
  }
}

test.each(['Control', 'Benchmark'])(
  'createBenchmarkReport marks the full evaluation incomplete when %s fails',
  async treatment => {
    const benchmark = await createBenchmark()
    const plan = createBenchmarkPlan({benchmark})
    const results = plan.trials.map(trial => {
      return createResult(trial, trial.treatment.name === treatment)
    })
    const failed = results.find(entry => {
      return entry.result.type === 'error'
    })
    if (!failed) {
      throw new Error('Expected a failed trial')
    }

    const report = createBenchmarkReport({benchmark, runPlanResult: {results}})

    expect(report).toBe(
      [
        'Benchmark: Example',
        'Status: Incomplete\nComparative results are unavailable because one or more trials failed.',
        `Trial "${failed.trial.id}" failed: Error: Setup failed`,
      ].join('\n\n'),
    )
  },
)

test('createBenchmarkReport lists every error for an all-error evaluation without comparisons', async () => {
  const benchmark = await createBenchmark()
  const plan = createBenchmarkPlan({benchmark})
  const results = plan.trials.map(trial => {
    return createResult(trial, true)
  })

  const report = createBenchmarkReport({benchmark, runPlanResult: {results}})

  expect(report).toBe(
    [
      'Benchmark: Example',
      'Status: Incomplete\nComparative results are unavailable because one or more trials failed.',
      plan.trials
        .map(trial => {
          return `Trial "${trial.id}" failed: Error: Setup failed`
        })
        .join('\n'),
    ].join('\n\n'),
  )
})

test('createBenchmarkReport includes completed trials with failed checks in comparisons', async () => {
  const benchmark = await createBenchmark()
  const plan = createBenchmarkPlan({benchmark})
  const results = plan.trials.map(trial => {
    return createResult(trial)
  })

  const report = createBenchmarkReport({benchmark, runPlanResult: {results}})

  expect(report).not.toContain('Incomplete')
  expect(report).toContain('0.0%')
  expect(report).toContain('Output Tokens')
  expect(report).not.toContain('Control Errors')
})
