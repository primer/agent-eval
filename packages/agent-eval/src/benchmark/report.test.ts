import {expect, test} from 'vitest'
import {VirtualHost} from '../host'
import type {RunPlanResult} from '../plan'
import {getBenchmark} from './get'
import {createBenchmarkPlan, type BenchmarkTrial} from './plan'
import {createBenchmarkReport} from './report'

test('createBenchmarkReport keeps failed control and benchmark runs distinct from completed evaluations', async () => {
  const host = VirtualHost.create({
    '/benchmarks/example.ts':
      'export default {name: "Example", description: "Compare treatments", models: ["gpt-5.5"], capabilities: [{name: "Components", scenarios: ["example"]}]}',
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {prompt: "Build a page"}',
  })
  const benchmark = await getBenchmark({
    host,
    name: 'example',
    benchmarksDirectory: '/benchmarks',
    scenariosDirectory: '/scenarios',
  })
  const plan = createBenchmarkPlan({benchmark})
  const runPlanResult: RunPlanResult<BenchmarkTrial> = {
    results: plan.trials.map(trial => {
      return {
        trial,
        result: {
          type: 'error',
          error: {
            name: 'TypeError',
            message: `${trial.treatment.name} setup failed`,
          },
        },
      }
    }),
  }

  const report = createBenchmarkReport({benchmark, runPlanResult})
  const [header, separator, row] = report.split('\n')
  const columns = Object.fromEntries(
    [...separator.matchAll(/-+/g)].map(match => {
      return [
        header.slice(match.index, match.index + match[0].length).trim(),
        row.slice(match.index, match.index + match[0].length).trim(),
      ]
    }),
  )

  expect(columns).toMatchObject({
    'Control Runs': '0',
    'Control Errors': '1',
    Runs: '0',
    Errors: '1',
    'Output Tokens': 'N/A',
    'AI Credits': 'N/A',
    'Session Time': 'N/A',
  })
  expect(report).toContain('Control setup failed')
  expect(report).toContain('Benchmark setup failed')
})
