import {describe, expect, expectTypeOf, test} from 'vitest'
import assert from 'node:assert/strict'
import {VirtualHost} from '../host'
import type {RunPlanResult} from '../plan'
import {getExperiment} from './get'
import {createExperimentPlan} from './plan'
import type {BenchmarkTrial} from '../benchmark/plan'
import type {Trial} from '../trial/trial'
import {runExperimentPlan} from './run'
import {
  createExperimentOutput,
  ExperimentOutputFileSchema,
  mergeExperimentOutputFiles,
  parseExperimentTrialOutput,
  writeExperimentOutput,
} from './output'
import {createExperimentReport} from './report'

function createRunPlanResult<T extends Trial>(trials: Array<T>): RunPlanResult<T> {
  return {
    results: trials.map(trial => {
      return {
        trial,
        result: {
          trial,
          agent: {
            sessions: [],
          },
          judges: [],
          checks: [],
          walkthrough: {
            type: 'Unavailable',
          },
          artifacts: {
            directory: `/results/artifacts/${trial.id}`,
            copilotConfigDirectory: '',
            skillsConfigDirectory: '',
            walkthroughDirectory: '',
            workspaceDirectory: '',
          },
        },
      }
    }),
  }
}

async function createFixture() {
  const host = VirtualHost.create({
    '/experiments/example.ts': `export default {
      name: 'Example', description: 'Compare', models: ['gpt-5.5'],
      benchmark: 'suite', treatments: [{name: 'Skill'}],
    }`,
    '/benchmarks/suite.ts': `export default {
      name: 'Suite', description: 'Suite', models: ['gpt-5.5'],
      capabilities: [
        {name: 'First capability', scenarios: ['example']},
        {name: 'Second capability', scenarios: ['example']},
      ],
    }`,
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {prompt: "Create a page"}',
  })
  const experiment = await getExperiment({
    host,
    experimentsDirectory: '/experiments',
    benchmarksDirectory: '/benchmarks',
    scenariosDirectory: '/scenarios',
    name: 'example',
  })
  const plan = createExperimentPlan({experiment})
  assert(plan.type === 'benchmark')
  const runPlanResult = createRunPlanResult(plan.plan.trials)
  return {
    host,
    type: plan.type,
    experiment: plan.experiment,
    runPlanResult,
  }
}

describe('experiment outputs', () => {
  test('preserves scenario-only result bundles and reports without benchmark metadata', async () => {
    const {host} = await createFixture()
    await host.fs.writeFile(
      '/experiments/scenarios.ts',
      `export default {
        name: 'Scenarios', description: 'Compare', models: ['gpt-5.5'],
        scenarios: ['example'], treatments: [{name: 'Skill'}],
      }`,
    )
    const experiment = await getExperiment({
      host,
      experimentsDirectory: '/experiments',
      benchmarksDirectory: '/benchmarks',
      scenariosDirectory: '/scenarios',
      name: 'scenarios',
    })
    const plan = createExperimentPlan({experiment})
    assert(plan.type === 'scenarios')
    const run = {
      type: plan.type,
      experiment: plan.experiment,
      runPlanResult: createRunPlanResult(plan.plan.trials),
    }
    const output = createExperimentOutput(run)
    await writeExperimentOutput({
      host,
      output,
      outputPath: '/results/output.json',
    })
    const file = ExperimentOutputFileSchema.parse(JSON.parse(await host.fs.readFile('/results/output.json', 'utf8')))
    const restored = await mergeExperimentOutputFiles({
      host,
      outputs: [file],
      outputDirectory: '/results',
    })

    expect(restored).toEqual(output)
    expect(output.benchmark).toBeUndefined()
    expect(
      [...output.trials.values()].map(trial => {
        return trial.capabilityId
      }),
    ).toEqual([undefined, undefined])
    expect(createExperimentReport(run)).not.toContain('Capability')
  })

  test('round trips and merges capability membership with a complete benchmark snapshot', async () => {
    const {host, experiment, runPlanResult} = await createFixture()
    const expected = createExperimentOutput({type: 'benchmark', experiment, runPlanResult})
    const files = []
    for (const [index, results] of [runPlanResult.results.slice(0, 3), runPlanResult.results.slice(3)].entries()) {
      const output = createExperimentOutput({type: 'benchmark', experiment, runPlanResult: {results}})
      const outputPath = `/results/output-${index + 1}.json`
      await writeExperimentOutput({host, output, outputPath})
      files.push(ExperimentOutputFileSchema.parse(JSON.parse(await host.fs.readFile(outputPath, 'utf8'))))
    }

    const merged = await mergeExperimentOutputFiles({host, outputs: files, outputDirectory: '/results'})

    expect(merged).toEqual(expected)
    expect(
      Object.values(merged.benchmark!.capabilities).map(capability => {
        return capability.scenarioIds
      }),
    ).toEqual([['example'], ['example']])
    expect(merged.trials.size).toBe(6)
    const capability = experiment.benchmark.capabilities[0]
    capability.name = 'Changed later'
    expect(merged.benchmark!.capabilities[capability.id].name).toBe('First capability')
  })

  test('preserves empty capabilities and treatment coverage in a partial result', async () => {
    const {experiment} = await createFixture()
    const output = createExperimentOutput({type: 'benchmark', experiment, runPlanResult: {results: []}})

    expect(output.trials.size).toBe(0)
    expect(Object.keys(output.benchmark!.capabilities)).toHaveLength(2)
    expect(
      [...output.treatments.values()].map(treatment => {
        return treatment.name
      }),
    ).toEqual(['Control', 'Benchmark', 'Skill'])
    expect([...output.scenarios.keys()]).toEqual(['example'])
  })

  test('rejects conflicting benchmark snapshots rather than combining incompatible runs', async () => {
    const {host, experiment, runPlanResult} = await createFixture()
    const output = createExperimentOutput({type: 'benchmark', experiment, runPlanResult})
    await writeExperimentOutput({host, output, outputPath: '/results/output.json'})
    const file = ExperimentOutputFileSchema.parse(JSON.parse(await host.fs.readFile('/results/output.json', 'utf8')))
    const changed = {...file, benchmark: {...file.benchmark!, name: 'Changed'}}

    await expect(
      mergeExperimentOutputFiles({host, outputs: [file, changed], outputDirectory: '/results'}),
    ).rejects.toThrow('conflicting benchmark metadata')
  })

  test('requires explicit valid membership and continues to parse ordinary experiment trials', async () => {
    const {experiment, runPlanResult} = await createFixture()
    const output = createExperimentOutput({type: 'benchmark', experiment, runPlanResult})
    const trial = [...output.trials.values()][0]
    const {capabilityId: _capabilityId, ...ordinary} = trial
    expect(_capabilityId).toBeDefined()

    expect(parseExperimentTrialOutput(ordinary)).toEqual(ordinary)
    expect(() => {
      return parseExperimentTrialOutput(ordinary, output.benchmark)
    }).toThrow('Invalid capability')
    expect(() => {
      return parseExperimentTrialOutput({...trial, scenarioId: 'unrelated'}, output.benchmark)
    }).toThrow('Invalid capability')
    expect(() => {
      return parseExperimentTrialOutput(trial)
    }).toThrow('Unexpected capability')
  })
})

test('preserves the benchmark variant when execution selects an empty shard', async () => {
  const {host, experiment} = await createFixture()
  const plan = createExperimentPlan({experiment})
  const total = plan.plan.trials.length + 1

  const run = await runExperimentPlan({
    plan,
    host,
    shard: {
      order: total,
      total,
    },
    artifactsDirectory: '/results/artifacts',
    copilotToken: 'unused',
    copilotConcurrency: 1,
    containerConcurrency: 1,
  })

  assert(run.type === 'benchmark')
  expectTypeOf(run.runPlanResult).toEqualTypeOf<RunPlanResult<BenchmarkTrial>>()
  expect(run.runPlanResult.results).toEqual([])
  expect(Object.keys(createExperimentOutput(run).benchmark!.capabilities)).toHaveLength(2)
})

describe('createExperimentReport', () => {
  test('reports each capability with both references and custom treatments without flattening membership', async () => {
    const {experiment, runPlanResult} = await createFixture()

    const report = createExperimentReport({type: 'benchmark', experiment, runPlanResult})

    expect(report).toContain('Capability')
    expect(report.match(/First capability/g)).toHaveLength(3)
    expect(report.match(/Second capability/g)).toHaveLength(3)
    expect(report.match(/Control/g)).toHaveLength(2)
    expect(report.match(/Benchmark/g)).toHaveLength(2)
    expect(report.match(/Skill/g)).toHaveLength(2)
    expect(report.indexOf('First capability')).toBeLessThan(report.indexOf('Second capability'))
  })
})
