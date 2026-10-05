import {expect, test} from 'vitest'
import {VirtualHost} from '../host'
import type {RunPlanResult} from '../plan'
import {listBenchmarks} from './list'
import {createBenchmarkPlan, createBenchmarkPlanManifest, type BenchmarkTrial} from './plan'
import {createBenchmarkReport} from './report'

test('benchmark reports display scenario names while plans reference hashed IDs', async () => {
  const host = VirtualHost.create({
    '/benchmarks/example.ts': `export default {
      name: 'Example benchmark',
      description: 'Example',
      models: ['gpt-5.5'],
      capabilities: [{name: 'Components', scenarios: ['example']}],
    }`,
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {prompt: "Create a page"}',
  })
  const [benchmark] = await listBenchmarks({
    host,
    benchmarksDirectory: '/benchmarks',
    scenariosDirectory: '/scenarios',
  })
  const plan = createBenchmarkPlan({benchmark})
  const runPlanResult: RunPlanResult<BenchmarkTrial> = {
    results: plan.trials.map(trial => {
      return {
        trial,
        result: {
          trial,
          agent: {sessions: []},
          artifacts: {
            directory: `/output/artifacts/${trial.id}`,
            copilotConfigDirectory: `/output/artifacts/${trial.id}/copilot`,
            skillsConfigDirectory: `/output/artifacts/${trial.id}/skills`,
            walkthroughDirectory: `/output/artifacts/${trial.id}/walkthrough`,
            workspaceDirectory: `/output/artifacts/${trial.id}/workspace`,
          },
          checks: [],
          judges: [],
          walkthrough: {type: 'Unavailable'},
        },
      }
    }),
  }

  const manifest = createBenchmarkPlanManifest({benchmark, plan})
  const report = createBenchmarkReport({benchmark, runPlanResult})

  expect(manifest.trials).toHaveLength(2)
  expect(
    manifest.trials.map(trial => {
      return trial.scenarioId
    }),
  ).toEqual(['2770381665', '2770381665'])
  expect(report).toContain('  example')
  expect(report).not.toContain('2770381665')
})
