import {describe, expect, test} from 'vitest'
import {getCliMode, normalizeOptionalPathArguments} from './cli-options'

describe('normalizeOptionalPathArguments', () => {
  test('adds defaults for bare optional path flags', () => {
    expect(normalizeOptionalPathArguments(['--benchmark', 'test', '--plan'])).toEqual([
      '--benchmark',
      'test',
      '--plan=plan.json',
    ])
    expect(normalizeOptionalPathArguments(['--from-plan', '--shard', '2/3'])).toEqual([
      '--from-plan=plan.json',
      '--shard',
      '2/3',
    ])
  })

  test('preserves explicit optional paths', () => {
    expect(normalizeOptionalPathArguments(['--plan', 'plans/test.json'])).toEqual(['--plan', 'plans/test.json'])
  })
})

describe('getCliMode', () => {
  test('creates plan and from-plan modes', () => {
    expect(
      getCliMode({
        benchmark: 'test',
        plan: 'plan.json',
      }),
    ).toEqual({
      kind: 'create-plan',
      sourceKind: 'benchmark',
      sourceId: 'test',
      path: 'plan.json',
    })
    expect(
      getCliMode({
        'from-plan': 'plan.json',
        shard: '2/3',
      }),
    ).toEqual({
      kind: 'from-plan',
      path: 'plan.json',
      shard: '2/3',
    })
  })

  test('validates incompatible modes', () => {
    expect(() => {
      getCliMode({
        benchmark: 'benchmark',
        experiment: 'experiment',
      })
    }).toThrow('--benchmark and --experiment cannot be combined')

    expect(() => {
      getCliMode({
        benchmark: 'benchmark',
        'from-plan': 'plan.json',
      })
    }).toThrow('--from-plan cannot be combined')

    expect(() => {
      getCliMode({
        benchmark: 'benchmark',
        shard: '1/2',
      })
    }).toThrow('--shard is only valid with --from-plan')

    expect(() => {
      getCliMode({
        experiment: 'experiment',
        'merge-results': true,
      })
    }).toThrow('--merge-results cannot be combined')

    expect(() => {
      getCliMode({
        plan: 'plan.json',
      })
    }).toThrow('--plan requires --benchmark or --experiment')
  })
})
