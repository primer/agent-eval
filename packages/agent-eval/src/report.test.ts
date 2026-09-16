import {describe, expect, test, vi} from 'vitest'
import type {CheckOutput} from './check'
import type {ModelVariant} from './model'
import {VirtualHost} from './host'
import type {RunPlanResult} from './plan'
import type {Benchmark} from './benchmark/benchmark'
import type {BenchmarkTrial} from './benchmark/plan'
import {
  createBenchmarkOutput,
  listBenchmarkOutputFiles,
  mergeBenchmarkOutputFiles,
  parseBenchmarkTrialOutput,
  writeBenchmarkOutput,
} from './benchmark/output'
import {createBenchmarkReport} from './benchmark/report'
import type {Experiment} from './experiment/experiment'
import {
  createExperimentOutput,
  listExperimentOutputFiles,
  mergeExperimentOutputFiles,
  writeExperimentOutput,
} from './experiment/output'
import {createExperimentReport} from './experiment/report'
import {addCheckResults, formatCheckSummaries, getCheckDimensions, getCheckValue} from './report/checks'
import {
  addTrialResultToSummary,
  createTrialSummary,
  createTrialSummaryComparator,
  formatTrialSummary,
} from './trial/report'
import {ControlTreatment, createTreatment} from './treatment'

function outcomes(statuses: Array<'passed' | 'failed' | 'skipped'>, name = 'tests', id?: string): CheckOutput {
  return {
    check: {name, files: []},
    result: {
      type: 'outcomes',
      id,
      outcomes: statuses.map((status, index) => {
        return {type: 'outcome', id: `test-${index}`, status}
      }),
    },
  }
}

function measurements(
  values: Array<number>,
  name = 'latency',
  direction: 'higher-is-better' | 'lower-is-better' | undefined = 'lower-is-better',
  unit = 'ms',
): CheckOutput {
  return {
    check: {name, files: []},
    result: {
      type: 'measurements',
      unit,
      direction,
      measurements: values.map(value => {
        return {type: 'measurement', value}
      }),
    },
  }
}

function createResult({
  id = 'trial',
  checks = [],
  scenarioId = 'example',
  treatment = 'Benchmark',
  model = {name: 'gpt-5.5', reasoningEffort: 'medium'},
  outputTokens = 10,
  capabilityId = 'capability',
}: {
  id?: string
  checks?: Array<CheckOutput>
  scenarioId?: string
  treatment?: string
  model?: ModelVariant
  outputTokens?: number
  capabilityId?: string
} = {}): RunPlanResult<BenchmarkTrial>['results'][number] {
  const scenario = {
    id: scenarioId,
    directory: `/scenarios/${scenarioId}`,
    prompt: 'Example',
    tags: [],
    checks: [],
    judges: [],
  }
  const trial: BenchmarkTrial = {
    id,
    scenario,
    treatment: createTreatment({name: treatment}),
    model,
    capability: {id: capabilityId, name: 'Capability', scenarios: [scenario]},
  }
  return {
    trial,
    result: {
      trial,
      checks,
      agent: {
        sessions: [
          {
            turns: 1,
            outputTokens,
            premiumRequests: 1,
            sessionDurationMs: 2000,
            totalApiDurationMs: 1000,
            tools: {},
            messages: [],
          },
        ],
      },
      artifacts: {
        directory: `/output/artifacts/${id}`,
        copilotConfigDirectory: `/output/artifacts/${id}/copilot`,
        skillsConfigDirectory: `/output/artifacts/${id}/skills`,
        walkthroughDirectory: `/output/artifacts/${id}/walkthrough`,
        workspaceDirectory: `/output/artifacts/${id}/workspace`,
      },
      judges: [],
      walkthrough: {type: 'Unavailable'},
    },
  }
}

function summarize(...results: Array<ReturnType<typeof createResult>>) {
  const summary = createTrialSummary()
  for (const {result} of results) {
    addTrialResultToSummary(summary, result)
  }
  return summary
}

function experiment(results: Array<ReturnType<typeof createResult>>): Experiment {
  return {
    id: 'example',
    filepath: '/experiments/example.ts',
    name: 'Example experiment',
    description: 'Example',
    models: results.map(({trial}) => {
      return trial.model
    }),
    scenarios: results.map(({trial}) => {
      return trial.scenario
    }),
    treatments: results.map(({trial}) => {
      return trial.treatment
    }),
  }
}

function benchmark(results: Array<ReturnType<typeof createResult>>): Benchmark {
  return {
    id: 'example',
    filepath: '/benchmarks/example.ts',
    name: 'Example benchmark',
    description: 'Example',
    models: results.map(({trial}) => {
      return trial.model
    }),
    capabilities: results.length > 0 ? [results[0].trial.capability] : [],
  }
}

describe('check dimensions', () => {
  test('averages per-trial percentages and measurements instead of pooling collections', () => {
    const summary = summarize(
      createResult({checks: [outcomes(['passed', 'failed']), measurements([10, 30])]}),
      createResult({checks: [outcomes(['passed']), measurements([100])]}),
    )
    const dimensions = getCheckDimensions([summary])

    expect(dimensions).toEqual([
      {
        key: '["example","latency"]',
        scenarioId: 'example',
        type: 'measurements',
        unit: 'ms',
        direction: 'lower-is-better',
      },
      {
        key: '["example","tests"]',
        scenarioId: 'example',
        type: 'outcomes',
        direction: 'higher-is-better',
      },
    ])
    expect(formatTrialSummary(summary, dimensions)).toMatchObject({
      Runs: 2,
      Checks: '60 ms; 75.0%',
      'Output Tokens': '20',
    })
  })

  test('keeps checks, named groups, and scenarios distinct', () => {
    const summary = summarize(
      createResult({
        checks: [outcomes(['passed']), outcomes(['failed'], 'tests', 'group'), outcomes(['passed'], 'other')],
      }),
      createResult({scenarioId: 'other', checks: [outcomes(['failed'])]}),
    )
    expect(summary.checks.size).toBe(4)
    expect([...summary.checks.values()].map(getCheckValue)).toEqual([100, 0, 100, 0])
  })

  test('preserves zero, negative, and small measurement values', () => {
    for (const [values, expected] of [
      [[0], '0 ms'],
      [[-2, -4], '-3 ms'],
      [[0.00001], '0.00001 ms'],
    ] as const) {
      const summary = summarize(createResult({checks: [measurements([...values])]}))
      expect(formatCheckSummaries(summary, getCheckDimensions([summary]))).toEqual({Checks: expected})
    }
  })

  test('excludes skips and errors from values and reports them explicitly', () => {
    const summary = summarize(
      createResult({
        checks: [
          {
            check: {name: 'tests', files: []},
            result: {
              type: 'outcomes',
              outcomes: [
                {type: 'outcome', status: 'passed'},
                {type: 'outcome', status: 'failed'},
                {type: 'outcome', status: 'skipped'},
                {type: 'error', message: 'Could not run the test'},
              ],
            },
          },
          {
            check: {name: 'measurements', files: []},
            result: {
              type: 'measurements',
              measurements: [
                {type: 'measurement', value: 4},
                {type: 'error', message: 'Could not measure'},
              ],
            },
          },
        ],
      }),
    )
    expect(formatCheckSummaries(summary, getCheckDimensions([summary]))).toEqual({
      Checks: '4 [1 error]; 50.0% [1 skipped; 1 error]',
    })
  })

  test('shows empty, skipped-only, error-only, and missing results as unavailable', () => {
    const summary = summarize(
      createResult({
        checks: [
          outcomes([], 'empty'),
          outcomes(['skipped'], 'skipped'),
          {
            check: {name: 'errors', files: []},
            result: {type: 'measurements', measurements: [{type: 'error', message: 'Unavailable'}]},
          },
          outcomes(['passed'], 'partial'),
        ],
      }),
      createResult(),
    )
    const absent = summarize(createResult())
    const dimensions = getCheckDimensions([summary])
    expect(formatCheckSummaries(summary, dimensions)).toEqual({
      Checks: 'N/A [0/2 check results with values; 1 error]; 100.0% [1/6 check results with values; 1 skipped]',
    })
    expect(formatCheckSummaries(absent, dimensions)).toEqual({
      Checks: 'N/A [0/1 check results with values]; N/A [0/3 check results with values]',
    })
  })

  test('rolls up checks, named groups, and scenarios without pooling collection values', () => {
    const summary = summarize(
      createResult({
        checks: [
          outcomes(['passed', 'failed'], 'tests', 'unit'),
          outcomes(['passed'], 'tests', 'integration'),
          measurements([10, 30]),
          measurements([40], 'render'),
        ],
      }),
      createResult({
        checks: [
          outcomes(['failed'], 'tests', 'unit'),
          outcomes(['passed'], 'tests', 'integration'),
          measurements([80]),
          measurements([100], 'render'),
        ],
      }),
      createResult({
        scenarioId: 'other',
        checks: [outcomes(['failed', 'failed']), measurements([60])],
      }),
    )

    expect(formatCheckSummaries(summary, getCheckDimensions([summary]))).toEqual({
      Checks: '60 ms; 50.0%',
    })
    expect(summary.checks.size).toBe(6)
  })

  test('keeps incompatible units and directions separate without individual check names', () => {
    const summary = summarize(
      createResult({
        checks: [
          measurements([10], 'latency'),
          measurements([30], 'render'),
          measurements([5], 'duration', 'higher-is-better'),
          measurements([7], 'size', 'lower-is-better', 'bytes'),
          {
            check: {name: 'score', files: []},
            result: {type: 'measurements', measurements: [{type: 'measurement', value: 2}]},
          },
        ],
      }),
    )

    const row = formatCheckSummaries(summary, getCheckDimensions([summary]))
    expect(Object.keys(row)).toEqual(['Checks'])
    expect(String(row.Checks).split('; ')).toEqual(
      expect.arrayContaining(['20 ms [lower-is-better]', '5 ms [higher-is-better]', '7 bytes', '2']),
    )
    expect(String(row.Checks).split('; ')).toHaveLength(4)
  })

  test('does not include checks from unrelated scenarios in a scenario row', () => {
    const first = summarize(createResult({checks: [outcomes(['passed'])]}))
    const second = summarize(createResult({scenarioId: 'other', checks: [measurements([20])]}))
    const dimensions = getCheckDimensions([first, second])

    expect(formatCheckSummaries(first, dimensions)).toEqual({Checks: '100.0%'})
    expect(formatCheckSummaries(second, dimensions)).toEqual({Checks: '20 ms'})
  })

  test('reports missing check results instead of hiding partial rollup coverage', () => {
    const complete = summarize(createResult({checks: [outcomes(['passed']), outcomes(['failed'], 'other')]}))
    const partial = summarize(createResult({checks: [outcomes(['passed'])]}))

    expect(formatCheckSummaries(partial, getCheckDimensions([complete, partial]))).toEqual({
      Checks: '100.0% [1/2 check results with values]',
    })
  })

  test('compares aggregate check means with aggregate control means', () => {
    const control = summarize(
      createResult({checks: [outcomes(['passed', 'failed']), outcomes(['passed'], 'other'), measurements([20])]}),
    )
    const treatment = summarize(
      createResult({checks: [outcomes(['passed']), outcomes(['passed'], 'other'), measurements([10])]}),
    )
    expect(formatCheckSummaries(treatment, getCheckDimensions([control, treatment]), control)).toEqual({
      Checks: '10 ms (-50.0%); 100.0% (+33.3%)',
    })
  })

  test('shows unavailable values for missing benchmark or control check results', () => {
    const present = summarize(createResult({checks: [outcomes(['passed'])]}))
    const absent = createTrialSummary()
    const dimensions = getCheckDimensions([present])

    expect(formatCheckSummaries(absent, dimensions, present)).toEqual({Checks: 'N/A (N/A)'})
    expect(formatCheckSummaries(present, dimensions, absent)).toEqual({Checks: '100.0% (N/A)'})
    expect(formatCheckSummaries(absent, dimensions)).toEqual({Checks: 'N/A'})
  })

  test('rejects duplicate groups within one trial', () => {
    expect(() => {
      summarize(createResult({checks: [outcomes(['passed']), outcomes(['failed'])]}))
    }).toThrow('Duplicate check result')
  })

  test.each([
    outcomes(['passed'], 'latency'),
    measurements([5], 'latency', 'higher-is-better'),
    measurements([5], 'latency', 'lower-is-better', 'seconds'),
  ])('rejects incompatible metadata within and across summaries: %j', check => {
    const first = summarize(createResult({checks: [measurements([10])]}))
    expect(() => {
      addCheckResults(first.checks, 'example', [check])
    }).toThrow('Incompatible check results')

    const second = summarize(createResult({checks: [check]}))
    expect(() => {
      getCheckDimensions([first, second])
    }).toThrow('Incompatible check results')
  })
})

describe('equal-weight check ordering', () => {
  test('ranks outcome percentages ahead of usage', () => {
    const better = summarize(createResult({checks: [outcomes(['passed'])], outputTokens: 100}))
    const worse = summarize(createResult({checks: [outcomes(['failed'])], outputTokens: 1}))
    expect([worse, better].toSorted(createTrialSummaryComparator([worse, better]))).toEqual([better, worse])
  })

  test('respects both measurement directions', () => {
    for (const direction of ['higher-is-better', 'lower-is-better'] as const) {
      const better = summarize(
        createResult({
          checks: [measurements([direction === 'higher-is-better' ? 20 : 5], 'value', direction)],
          outputTokens: 100,
        }),
      )
      const worse = summarize(createResult({checks: [measurements([10], 'value', direction)], outputTokens: 1}))
      expect(createTrialSummaryComparator([better, worse])(better, worse)).toBeLessThan(0)
    }
  })

  test('gives each dimension equal influence regardless of scale or collection size', () => {
    const better = summarize(
      createResult({
        checks: [
          outcomes(['passed']),
          measurements([1], 'latency'),
          measurements(
            Array.from({length: 100}, () => {
              return 1_000_000
            }),
            'size',
          ),
        ],
        outputTokens: 100,
      }),
    )
    const worse = summarize(
      createResult({
        checks: [outcomes(['failed']), measurements([2], 'latency'), measurements([1], 'size')],
        outputTokens: 1,
      }),
    )
    expect(createTrialSummaryComparator([better, worse])(better, worse)).toBeLessThan(0)
  })

  test('uses cohort ranks rather than a cyclic pairwise majority comparator', () => {
    const summaries = [
      [3, 1, 2],
      [2, 3, 1],
      [1, 2, 3],
    ].map((values, index) => {
      return summarize(
        createResult({
          outputTokens: index + 1,
          checks: values.map((value, dimension) => {
            return measurements([value], `dimension-${dimension}`, 'higher-is-better')
          }),
        }),
      )
    })
    const compare = createTrialSummaryComparator(summaries)
    expect(compare(summaries[0], summaries[1])).toBeLessThan(0)
    expect(compare(summaries[1], summaries[2])).toBeLessThan(0)
    expect(compare(summaries[0], summaries[2])).toBeLessThan(0)
    expect(summaries.toReversed().toSorted(compare)).toEqual(summaries)
  })

  test('does not rank missing, incomplete, errored, or directionless dimensions', () => {
    const unknown: CheckOutput = {
      check: {name: 'tests', files: []},
      result: {type: 'measurements', measurements: [{type: 'measurement', value: 100}]},
    }
    const errored: CheckOutput = {
      check: {name: 'tests', files: []},
      result: {
        type: 'outcomes',
        outcomes: [
          {type: 'outcome', status: 'passed'},
          {type: 'error', message: 'Error'},
        ],
      },
    }
    for (const checks of [[], [outcomes([])], [errored], [unknown]]) {
      const cheaper = summarize(createResult({checks, outputTokens: 1}))
      const otherCheck =
        checks[0]?.result.type !== 'measurements'
          ? outcomes(['failed'])
          : {
              ...unknown,
              result: {type: 'measurements' as const, measurements: [{type: 'measurement' as const, value: 0}]},
            }
      const other = summarize(createResult({checks: [otherCheck], outputTokens: 100}))
      expect(createTrialSummaryComparator([cheaper, other])(cheaper, other)).toBeLessThan(0)
    }

    const partial = summarize(
      createResult({checks: [outcomes(['failed'])], outputTokens: 1}),
      createResult({outputTokens: 1}),
    )
    const complete = summarize(createResult({checks: [outcomes(['passed'])], outputTokens: 100}))
    expect(createTrialSummaryComparator([partial, complete])(partial, complete)).toBeLessThan(0)
  })

  test('preserves usage ordering when no checks exist', () => {
    const cheaper = summarize(createResult({outputTokens: 1}))
    const expensive = summarize(createResult({outputTokens: 100}))
    expect(createTrialSummaryComparator([expensive, cheaper])(cheaper, expensive)).toBeLessThan(0)
  })

  test('assigns tied values the same rank independent of input order', () => {
    const summaries = [
      summarize(createResult({checks: [outcomes(['passed'])], outputTokens: 1})),
      summarize(createResult({checks: [outcomes(['passed'])], outputTokens: 2})),
      summarize(createResult({checks: [outcomes(['failed'])], outputTokens: 0})),
    ]
    expect(summaries.toReversed().toSorted(createTrialSummaryComparator(summaries.toReversed()))).toEqual(summaries)
  })
})

describe('run reports', () => {
  test('experiment reports include checks at treatment, scenario, and model levels', () => {
    const results = [
      createResult({id: 'a', treatment: 'Cheaper', checks: [outcomes(['failed'])], outputTokens: 1}),
      createResult({id: 'b', treatment: 'Better', checks: [outcomes(['passed'])], outputTokens: 100}),
    ]
    const report = createExperimentReport({experiment: experiment(results), runPlanResult: {results}})
    expect(report.split('\n')[0].match(/\bChecks\b/g)).toHaveLength(1)
    expect(report).not.toContain('Check [')
    expect(report).not.toContain('"tests"')
    expect(report.match(/100\.0%/g)).toHaveLength(3)
    expect(report.indexOf('Better')).toBeLessThan(report.indexOf('Cheaper'))
    expect(report).toContain('equal-weight ranks')
  })

  test('benchmark reports compare percentages and measurements with control', () => {
    const results = [
      createResult({id: 'control', treatment: 'Control', checks: [outcomes(['passed', 'failed']), measurements([20])]}),
      createResult({id: 'benchmark', checks: [outcomes(['passed']), measurements([10])]}),
    ]
    const report = createBenchmarkReport({benchmark: benchmark(results), runPlanResult: {results}})
    expect(report.match(/100\.0% \(\+100\.0%\)/g)).toHaveLength(3)
    expect(report.match(/10 ms \(-50\.0%\)/g)).toHaveLength(3)
    expect(report.split('\n')[0].match(/\bChecks\b/g)).toHaveLength(1)
    expect(report).not.toContain('Check [')
    expect(report).toContain('Control Runs')
  })

  test('benchmark models are ordered by checks ahead of usage', () => {
    const results = [
      createResult({
        id: 'worse',
        model: {name: 'gpt-5.5', reasoningEffort: 'low'},
        checks: [outcomes(['failed'])],
        outputTokens: 1,
      }),
      createResult({
        id: 'better',
        model: {name: 'gpt-5.5', reasoningEffort: 'high'},
        checks: [outcomes(['passed'])],
        outputTokens: 100,
      }),
    ]
    const report = createBenchmarkReport({benchmark: benchmark(results), runPlanResult: {results}})
    expect(report.indexOf('high')).toBeLessThan(report.indexOf('low'))
    expect(report).toContain('100.0% (N/A)')
  })

  test('benchmark check changes handle zero and absent baselines', () => {
    const results = [
      createResult({id: 'control', treatment: 'Control', checks: [outcomes(['failed']), measurements([0])]}),
      createResult({id: 'benchmark', checks: [outcomes(['passed']), measurements([0]), outcomes(['passed'], 'new')]}),
    ]
    const report = createBenchmarkReport({benchmark: benchmark(results), runPlanResult: {results}})
    expect(report).toContain('100.0% (N/A)')
    expect(report).toContain('0 ms (0%)')
    expect(report).not.toMatch(/NaN|Infinity/)
  })

  test('benchmark reports surface control-side skips and errors', () => {
    const results = [
      createResult({
        id: 'control',
        treatment: 'Control',
        checks: [
          {
            check: {name: 'tests', files: []},
            result: {
              type: 'outcomes',
              outcomes: [
                {type: 'outcome', status: 'skipped'},
                {type: 'error', message: 'Could not run'},
              ],
            },
          },
        ],
      }),
      createResult({id: 'benchmark', checks: [outcomes(['passed'])]}),
    ]
    const report = createBenchmarkReport({benchmark: benchmark(results), runPlanResult: {results}})
    expect(report).toContain('100.0% (N/A) [control: 0/1 check results with values; 1 skipped; 1 error]')
  })

  test('preserves empty and usage-only report behavior', () => {
    expect(createExperimentReport({experiment: experiment([]), runPlanResult: {results: []}})).toBe(
      'Experiment: Example experiment\nNo trial results.',
    )
    expect(createBenchmarkReport({benchmark: benchmark([]), runPlanResult: {results: []}})).toBe(
      'Benchmark: Example benchmark\nNo trial results.',
    )
    const results = [createResult()]
    expect(createExperimentReport({experiment: experiment(results), runPlanResult: {results}})).not.toContain('Checks')
    expect(createBenchmarkReport({benchmark: benchmark(results), runPlanResult: {results}})).not.toContain('Checks')
  })
})

describe.each(['benchmark', 'experiment'] as const)('%s trial artifact paths', kind => {
  const mergeOutputFiles = kind === 'benchmark' ? mergeBenchmarkOutputFiles : mergeExperimentOutputFiles

  test.each([
    '../outside/trial.json',
    '../output-sibling/trial.json',
    'artifacts/../../../outside/trial.json',
    '/outside/trial.json',
    '/output/artifacts/trial/trial.json',
    '..',
    '.',
  ])('rejects invalid trial path %s without reading or deleting files', async relativePath => {
    const host = VirtualHost.create({
      '/output/artifacts/trial/trial.json': 'Do not read or delete',
      '/outside/trial.json': 'Do not read or delete',
      '/output-sibling/trial.json': 'Do not read or delete',
    })
    const before = host.vol.toJSON()
    const readFile = vi.spyOn(host.fs, 'readFile')
    const unlink = vi.spyOn(host.fs, 'unlink')
    const file = {id: 'example', capabilities: {}, scenarios: {}, treatments: {}, trials: {trial: relativePath}}

    await expect(mergeOutputFiles({host, outputs: [file], outputDirectory: '/output'})).rejects.toThrow(
      /bundle-relative path|inside the result bundle/,
    )
    expect(readFile).not.toHaveBeenCalled()
    expect(unlink).not.toHaveBeenCalled()
    expect(host.vol.toJSON()).toEqual(before)
  })

  test.each(['file', 'directory'] as const)(
    'rejects escaping %s symlinks before reading or deleting files',
    async symlinkKind => {
      const host = VirtualHost.create({
        '/output/placeholder': '',
        '/outside/trial.json': 'Do not read or delete',
      })
      const relativePath = symlinkKind === 'file' ? 'trial.json' : 'linked/trial.json'
      await host.fs.symlink(
        symlinkKind === 'file' ? '/outside/trial.json' : '/outside',
        symlinkKind === 'file' ? '/output/trial.json' : '/output/linked',
      )
      const before = host.vol.toJSON()
      const readFile = vi.spyOn(host.fs, 'readFile')
      const unlink = vi.spyOn(host.fs, 'unlink')
      const file = {id: 'example', capabilities: {}, scenarios: {}, treatments: {}, trials: {trial: relativePath}}

      await expect(mergeOutputFiles({host, outputs: [file], outputDirectory: '/output'})).rejects.toThrow(
        'inside the result bundle',
      )
      expect(readFile).not.toHaveBeenCalled()
      expect(unlink).not.toHaveBeenCalled()
      expect(host.vol.toJSON()).toEqual(before)
    },
  )

  test.each(['normalized path', 'file symlink', 'directory symlink', 'bundle symlink'])(
    'accepts a contained %s without changing its files',
    async variant => {
      const results = [createResult()]
      const trial = createBenchmarkOutput({benchmark: benchmark(results), runPlanResult: {results}}).trials.get('trial')
      const host = VirtualHost.create({
        '/output/artifacts/trial/trial.json': JSON.stringify(trial),
      })
      let outputDirectory = '/output'
      let relativePath = 'artifacts/trial/../trial/trial.json'
      if (variant === 'file symlink') {
        await host.fs.symlink('/output/artifacts/trial/trial.json', '/output/trial.json')
        relativePath = 'trial.json'
      } else if (variant === 'directory symlink') {
        await host.fs.symlink('/output/artifacts/trial', '/output/linked')
        relativePath = 'linked/trial.json'
      } else if (variant === 'bundle symlink') {
        await host.fs.symlink('/output', '/bundle')
        outputDirectory = '/bundle'
      }
      const file = {
        id: 'example',
        capabilities: {capability: {id: 'capability', name: 'Capability', scenarioIds: ['example']}},
        scenarios: {},
        treatments: {},
        trials: {trial: relativePath},
      }

      const merged = await mergeOutputFiles({host, outputs: [file], outputDirectory})

      expect(merged.trials.get('trial')?.id).toBe('trial')
      expect(host.existsSync(`${outputDirectory}/${relativePath}`)).toBe(true)
      expect(host.existsSync('/output/artifacts/trial/trial.json')).toBe(true)
    },
  )
})

describe.each(['benchmark', 'experiment'] as const)('%s check result bundles', kind => {
  test('preserves checks through create, write, and shard merge', async () => {
    const checks: Array<CheckOutput> = [
      outcomes(['passed', 'failed', 'skipped'], 'tests', 'unit'),
      measurements([0, 2], 'latency'),
      {
        check: {
          name: 'error',
          description: 'A failed check',
          files: [{filepath: '/scenarios/example/check.ts', relativePath: 'check.ts'}],
        },
        result: {type: 'outcomes', outcomes: [{type: 'error', message: 'Could not run'}]},
      },
    ]
    const results = [createResult({checks})]
    const host = VirtualHost.create()
    await host.fs.mkdir('/output/artifacts/trial', {recursive: true})

    if (kind === 'benchmark') {
      const output = createBenchmarkOutput({benchmark: benchmark(results), runPlanResult: {results}})
      expect(output.trials.get('trial')?.checks).toEqual(checks)
      await writeBenchmarkOutput({host, output, outputPath: '/output/output-1.json'})
      const files = await listBenchmarkOutputFiles({host, outputDirectory: '/output'})
      const merged = await mergeBenchmarkOutputFiles({
        host,
        outputs: files.map(([file]) => {
          return file
        }),
        outputDirectory: '/output',
      })
      expect(merged.trials.get('trial')?.checks).toEqual(checks)
      await writeBenchmarkOutput({host, output: merged, outputPath: '/output/output.json'})
    } else {
      const output = createExperimentOutput({experiment: experiment(results), runPlanResult: {results}})
      expect(output.trials.get('trial')?.checks).toEqual(checks)
      await writeExperimentOutput({host, output, outputPath: '/output/output-1.json'})
      const files = await listExperimentOutputFiles({host, outputDirectory: '/output'})
      const merged = await mergeExperimentOutputFiles({
        host,
        outputs: files.map(([file]) => {
          return file
        }),
        outputDirectory: '/output',
      })
      expect(merged.trials.get('trial')?.checks).toEqual(checks)
      await writeExperimentOutput({host, output: merged, outputPath: '/output/output.json'})
    }

    expect(JSON.parse(await host.fs.readFile('/output/artifacts/trial/trial.json', 'utf8')).checks).toEqual(
      JSON.parse(JSON.stringify(checks)),
    )
    expect(JSON.parse(await host.fs.readFile('/output/output.json', 'utf8')).trials).toEqual({
      trial: 'artifacts/trial/trial.json',
    })
  })

  test('defaults omitted checks to an empty list', async () => {
    const results = [createResult({treatment: ControlTreatment.name})]
    const {result, trial} = results[0]
    const host = VirtualHost.create({
      '/output/artifacts/trial/trial.json': JSON.stringify({
        id: trial.id,
        capabilityId: trial.capability.id,
        agent: result.agent,
        artifacts: result.artifacts,
        judges: result.judges,
        model: trial.model,
        scenarioId: trial.scenario.id,
        treatmentId: trial.treatment.id,
        walkthrough: result.walkthrough,
      }),
    })
    const file = {id: 'example', scenarios: {}, treatments: {}, trials: {trial: 'artifacts/trial/trial.json'}}
    const merged =
      kind === 'benchmark'
        ? await mergeBenchmarkOutputFiles({
            host,
            outputs: [
              {
                ...file,
                capabilities: {
                  capability: {id: 'capability', name: 'Capability', scenarioIds: ['example']},
                },
              },
            ],
            outputDirectory: '/output',
          })
        : await mergeExperimentOutputFiles({host, outputs: [file], outputDirectory: '/output'})
    expect(merged.trials.get('trial')?.checks).toEqual([])
  })
})

describe('benchmark shard merging', () => {
  test('discovers only complete benchmark shard filenames', async () => {
    const shard = JSON.stringify({id: 'example', capabilities: {}, scenarios: {}, treatments: {}, trials: {}})
    const host = VirtualHost.create({
      '/output/output-1.json': shard,
      '/output/output-20.json': shard,
      '/output/debug-output-1.json': 'unrelated file',
      '/output/output-3.json.bak': 'unrelated file',
      '/output/output-3-extra.json': 'unrelated file',
      '/output/output-4.txt': 'unrelated file',
      '/output/output-5': 'unrelated file',
      '/output/output.json': 'unrelated file',
    })
    await host.fs.mkdir('/output/output-2.json')
    const before = host.vol.toJSON()

    const files = await listBenchmarkOutputFiles({host, outputDirectory: '/output'})

    expect(
      files
        .map(([, filepath]) => {
          return filepath
        })
        .sort(),
    ).toEqual(['/output/output-1.json', '/output/output-20.json'])
    expect(host.vol.toJSON()).toEqual(before)
  })

  test.each([false, true])('rejects a mismatched manifest trial ID (duplicate actual ID: %s)', async duplicate => {
    const results = [createResult({id: 'actual'})]
    const output = createBenchmarkOutput({benchmark: benchmark(results), runPlanResult: {results}})
    const relativePath = 'artifacts/actual/actual.json'
    const host = VirtualHost.create({
      [`/output/${relativePath}`]: JSON.stringify(output.trials.get('actual')),
    })
    const before = host.vol.toJSON()
    const trials: Record<string, string> = duplicate
      ? {actual: relativePath, expected: relativePath}
      : {expected: relativePath}
    const file = {
      id: output.id,
      capabilities: Object.fromEntries(output.capabilities),
      scenarios: Object.fromEntries(output.scenarios),
      treatments: Object.fromEntries(output.treatments),
      trials,
    }

    await expect(mergeBenchmarkOutputFiles({host, outputs: [file], outputDirectory: '/output'})).rejects.toThrow(
      'mismatched trial ID for: expected',
    )
    expect(host.vol.toJSON()).toEqual(before)
  })

  test.each(['valid', 'malformed', 'duplicate'] as const)(
    'preserves shard files when the later shard is %s',
    async laterShard => {
      const results = [createResult({id: 'first'}), createResult({id: 'second'})]
      const host = VirtualHost.create()
      for (const [index, result] of results.entries()) {
        await host.fs.mkdir(result.result.artifacts.directory, {recursive: true})
        await writeBenchmarkOutput({
          host,
          output: createBenchmarkOutput({benchmark: benchmark(results), runPlanResult: {results: [result]}}),
          outputPath: `/output/output-${index + 1}.json`,
        })
      }
      const outputs = (await listBenchmarkOutputFiles({host, outputDirectory: '/output'})).map(([file]) => {
        return file
      })
      if (laterShard === 'malformed') {
        await host.fs.writeFile('/output/artifacts/second/second.json', 'invalid JSON')
      } else if (laterShard === 'duplicate') {
        outputs[1].trials = {first: outputs[1].trials.second}
      }
      const before = host.vol.toJSON()
      const merge = mergeBenchmarkOutputFiles({host, outputs, outputDirectory: '/output'})
      if (laterShard === 'valid') {
        const merged = await merge
        expect(merged.trials.size).toBe(2)
        await expect(mergeBenchmarkOutputFiles({host, outputs, outputDirectory: '/output'})).resolves.toEqual(merged)
      } else if (laterShard === 'malformed') {
        await expect(merge).rejects.toThrow(SyntaxError)
      } else {
        await expect(merge).rejects.toThrow('duplicate trial ID found: first')
      }
      expect(host.vol.toJSON()).toEqual(before)
    },
  )
})

describe('benchmark capability output', () => {
  test('preserves explicit capability IDs through creation, serialization, and shard merging', async () => {
    const results = [createResult({id: 'first', capabilityId: 'a'}), createResult({id: 'second', capabilityId: 'b'})]
    const host = VirtualHost.create()
    for (const [index, result] of results.entries()) {
      await host.fs.mkdir(result.result.artifacts.directory, {recursive: true})
      const output = createBenchmarkOutput({benchmark: benchmark(results), runPlanResult: {results: [result]}})
      expect(output.trials.get(result.trial.id)?.capabilityId).toBe(result.trial.capability.id)
      await writeBenchmarkOutput({host, output, outputPath: `/output/output-${index}.json`})
    }
    const files = await listBenchmarkOutputFiles({host, outputDirectory: '/output'})
    const merged = await mergeBenchmarkOutputFiles({
      host,
      outputs: files.map(([file]) => {
        return file
      }),
      outputDirectory: '/output',
    })
    expect(merged.trials.get('first')?.capabilityId).toBe('a')
    expect(merged.trials.get('second')?.capabilityId).toBe('b')
    await writeBenchmarkOutput({host, output: merged, outputPath: '/output/output.json'})
    for (const {trial} of results) {
      const json = JSON.parse(await host.fs.readFile(`/output/artifacts/${trial.id}/${trial.id}.json`, 'utf8'))
      expect(json.capabilityId).toBe(trial.capability.id)
    }
  })

  test('requires an explicit capability ID even when the metadata is unambiguous', () => {
    const results = [createResult()]
    const output = createBenchmarkOutput({benchmark: benchmark(results), runPlanResult: {results}})
    const json: Record<string, unknown> = {...output.trials.get('trial')}
    delete json.capabilityId
    expect(() => {
      return parseBenchmarkTrialOutput(json, output.capabilities)
    }).toThrow('capabilityId')
  })

  test('rejects explicit unknown capability IDs and invalid scenario membership', () => {
    const results = [createResult()]
    const output = createBenchmarkOutput({benchmark: benchmark(results), runPlanResult: {results}})
    const trial = output.trials.get('trial')
    for (const json of [
      {...trial, capabilityId: 'unknown'},
      {...trial, scenarioId: 'other'},
    ]) {
      expect(() => {
        return parseBenchmarkTrialOutput(json, output.capabilities)
      }).toThrow('Invalid capability')
    }
  })
})
