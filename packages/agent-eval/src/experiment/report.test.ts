import {describe, expect, test} from 'vitest'
import type {CopilotRunner} from '../copilot-runner'
import {VirtualHost} from '../host'
import type {RunPlanResult} from '../plan'
import type {Experiment} from './experiment'
import {getExperiment} from './get'
import {createExperimentPlan, type ExperimentTrial} from './plan'
import {createExperimentReport} from './report'

async function createExperiment(type: Experiment['type'], runners: Array<CopilotRunner> = ['copilot-cli']) {
  const host = VirtualHost.create({
    '/experiments/example.ts': `export default ${JSON.stringify({
      name: 'Example',
      description: 'Compare treatments',
      models: [{name: 'gpt-5.5', reasoningEfforts: ['medium', 'high']}],
      runners,
      ...(type === 'benchmark' ? {benchmark: 'design-system'} : {scenarios: ['example']}),
      treatments: [{name: 'Skill'}],
    })}`,
    '/benchmarks/design-system.ts': `export default ${JSON.stringify({
      name: 'Design System',
      description: 'Evaluate capabilities',
      models: ['gpt-5.5'],
      capabilities: [
        {name: 'Components', scenarios: ['example']},
        {name: 'Layout', scenarios: ['example']},
      ],
    })}`,
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {prompt: "Create a page"}',
  })

  return getExperiment({
    host,
    benchmarksDirectory: '/benchmarks',
    experimentsDirectory: '/experiments',
    scenariosDirectory: '/scenarios',
    name: 'example',
  })
}

function createResult(
  trial: ExperimentTrial,
  outputTokens: number,
  passed = true,
): RunPlanResult<ExperimentTrial>['results'][number] {
  return {
    trial,
    result: {
      trial,
      agent: {
        sessions: [
          {
            turns: 1,
            outputTokens,
            premiumRequests: 1,
            sessionDurationMs: 1000,
            totalApiDurationMs: 500,
            tools: {},
            messages: [],
          },
        ],
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
                status: passed ? 'passed' : 'failed',
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
  }
}

function readReportRows(report: string): Array<Record<string, string>> {
  const [header, separator, ...lines] = report.split('\n\n')[0].split('\n')
  const columns = [...separator.matchAll(/-+/g)].map(match => {
    return {
      name: header.slice(match.index, match.index + match[0].length).trim(),
      start: match.index,
      end: match.index + match[0].length,
    }
  })

  return lines.map(line => {
    return Object.fromEntries(
      columns.map(column => {
        return [column.name, line.slice(column.start, column.end).trim()]
      }),
    )
  })
}

describe('createExperimentReport', () => {
  test('preserves scenario experiment rows without capability or runner columns', async () => {
    const experiment = await createExperiment('scenario')
    const plan = createExperimentPlan({experiment})
    const runPlanResult = {
      results: plan.trials.map(trial => {
        return createResult(trial, trial.model.reasoningEffort === 'medium' ? 10 : 20)
      }),
    }

    const report = createExperimentReport({experiment, runPlanResult})
    const rows = readReportRows(report)

    expect(rows).toHaveLength(8)
    expect(Object.keys(rows[0])).not.toContain('Capability')
    expect(Object.keys(rows[0])).not.toContain('Runner')
    expect(
      rows
        .filter(row => {
          return row.Experiment === 'Example'
        })
        .map(row => {
          return {
            treatment: row.Treatment,
            runs: row.Runs,
            checks: row.Checks,
            tokens: row['Output Tokens'],
          }
        }),
    ).toEqual([
      {treatment: 'Control', runs: '2', checks: '100.0%', tokens: '30'},
      {treatment: 'Skill', runs: '2', checks: '100.0%', tokens: '30'},
    ])
    expect(report).toContain('  example')
    expect(report).toContain('    gpt-5.5')
  })

  test('groups benchmark experiments by treatment, runner, capability, scenario, and model', async () => {
    const experiment = await createExperiment('benchmark', ['copilot-cli', 'copilot-sdk'])
    const plan = createExperimentPlan({experiment})
    const weights = new Map([
      ['Control', 1],
      ['Benchmark', 2],
      ['Skill', 3],
    ])
    const runPlanResult = {
      results: plan.trials.map(trial => {
        if (!('capability' in trial)) {
          throw new Error('Expected a benchmark trial')
        }
        const capabilityWeight = trial.capability.name === 'Components' ? 10 : 100
        const runnerWeight = trial.runner === 'copilot-cli' ? 1 : 2
        const modelWeight = trial.model.reasoningEffort === 'medium' ? 1 : 2
        const treatmentWeight = weights.get(trial.treatment.name)
        if (treatmentWeight === undefined) {
          throw new Error(`Unexpected treatment: ${trial.treatment.name}`)
        }
        return createResult(
          trial,
          capabilityWeight * runnerWeight * modelWeight * treatmentWeight,
          trial.capability.name === 'Components',
        )
      }),
    }

    const report = createExperimentReport({experiment, runPlanResult})
    const rows = readReportRows(report)
    const treatmentRows = rows.filter(row => {
      return row.Experiment === 'Example'
    })

    expect(rows).toHaveLength(54)
    expect(treatmentRows).toHaveLength(6)
    for (const treatment of treatmentRows) {
      const treatmentWeight = weights.get(treatment.Treatment)
      if (treatmentWeight === undefined) {
        throw new Error(`Unexpected treatment: ${treatment.Treatment}`)
      }
      const weight = treatmentWeight * (treatment.Runner === 'copilot-cli' ? 1 : 2)
      const start = rows.indexOf(treatment)
      const group = rows.slice(start, start + 9).map(row => {
        return [
          row.Capability,
          row.Scenario,
          row.Model,
          row['Reasoning Effort'],
          row.Runs,
          row.Checks,
          row['Output Tokens'],
        ]
      })

      expect(group).toEqual([
        ['All capabilities', 'All scenarios', 'All models', '', '4', '50.0%', (330 * weight).toLocaleString('en-US')],
        ['Components', 'All scenarios', 'All models', '', '2', '100.0%', (30 * weight).toLocaleString('en-US')],
        ['', 'example', 'All models', '', '2', '100.0%', (30 * weight).toLocaleString('en-US')],
        ['', '', 'gpt-5.5', 'medium', '1', '100.0%', (10 * weight).toLocaleString('en-US')],
        ['', '', 'gpt-5.5', 'high', '1', '100.0%', (20 * weight).toLocaleString('en-US')],
        ['Layout', 'All scenarios', 'All models', '', '2', '0.0%', (300 * weight).toLocaleString('en-US')],
        ['', 'example', 'All models', '', '2', '0.0%', (300 * weight).toLocaleString('en-US')],
        ['', '', 'gpt-5.5', 'medium', '1', '0.0%', (100 * weight).toLocaleString('en-US')],
        ['', '', 'gpt-5.5', 'high', '1', '0.0%', (200 * weight).toLocaleString('en-US')],
      ])
    }
  })

  test('reports only completed benchmark groups for an SDK-only run without checks', async () => {
    const experiment = await createExperiment('benchmark', ['copilot-cli', 'copilot-sdk'])
    const plan = createExperimentPlan({experiment})
    const selected = plan.trials.filter((trial: ExperimentTrial) => {
      return (
        'capability' in trial &&
        trial.capability.name === 'Components' &&
        trial.treatment.name === 'Benchmark' &&
        trial.runner === 'copilot-sdk' &&
        trial.model.reasoningEffort === 'high'
      )
    })
    const runPlanResult = {
      results: selected.map(trial => {
        const entry = createResult(trial, 10)
        entry.result.checks = []
        return entry
      }),
    }

    const report = createExperimentReport({experiment, runPlanResult})
    const rows = readReportRows(report)

    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({
      Treatment: 'Benchmark',
      Runner: 'copilot-sdk',
      Capability: 'All capabilities',
      Runs: '1',
      'Output Tokens': '10',
      'AI Credits': 'N/A',
    })
    expect(rows[1].Capability).toBe('Components')
    expect(rows[2].Scenario).toBe('example')
    expect(rows[3]['Reasoning Effort']).toBe('high')
    expect(Object.keys(rows[0])).not.toContain('Checks')
    expect(report).not.toContain('Layout')
    expect(report).not.toContain('Control')
  })

  test('rejects a benchmark experiment result without capability metadata', async () => {
    const experiment = await createExperiment('benchmark')
    const scenarioExperiment = await createExperiment('scenario')
    const plan = createExperimentPlan({experiment: scenarioExperiment})

    expect(() => {
      createExperimentReport({
        experiment,
        runPlanResult: {
          results: [createResult(plan.trials[0], 10)],
        },
      })
    }).toThrow(`Capability not found for benchmark experiment trial: ${plan.trials[0].id}`)
  })

  test.each(['scenario', 'benchmark'] as const)('reports no results for an empty %s experiment run', async type => {
    const experiment = await createExperiment(type)

    expect(createExperimentReport({experiment, runPlanResult: {results: []}})).toBe(
      'Experiment: Example\nNo trial results.',
    )
  })
})
