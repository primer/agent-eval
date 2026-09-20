import {describe, expect, test} from 'vitest'
import {formatDuration, formatPercentDelta, formatTable, type TableRow} from './format'

describe('formatDuration', () => {
  test.each([
    {name: 'zero elapsed time', ms: 0, expected: '0.0s'},
    {name: 'fractional seconds', ms: 1240, expected: '1.2s'},
    {name: 'just below one minute', ms: 59_900, expected: '59.9s'},
    {name: 'exactly one minute', ms: 60_000, expected: '1m 0.0s'},
    {name: 'multiple minutes with rounded remaining seconds', ms: 125_678, expected: '2m 5.7s'},
  ])('displays $name', ({ms, expected}) => {
    const result = formatDuration(ms)

    expect(result).toBe(expected)
  })
})

describe('formatPercentDelta', () => {
  test.each([
    {name: 'an increase relative to control', control: 3, treatment: 4, expected: '+33.3%'},
    {name: 'a decrease relative to control', control: 4, treatment: 3, expected: '-25.0%'},
    {name: 'unchanged nonzero values', control: 7, treatment: 7, expected: '0%'},
    {name: 'unchanged zero values', control: 0, treatment: 0, expected: '0%'},
    {name: 'a nonzero treatment without a nonzero baseline', control: 0, treatment: 7, expected: 'N/A'},
    {name: 'a decrease to zero', control: 7, treatment: 0, expected: '-100.0%'},
  ])('displays $name', ({control, treatment, expected}) => {
    const result = formatPercentDelta(control, treatment)

    expect(result).toBe(expected)
  })
})

describe('formatTable', () => {
  test('aligns selected columns in caller order, preserving row order and indentation', () => {
    const rows: Array<TableRow> = [
      {Runs: 2, Name: 'zeta', Hidden: 'not a report column'},
      {Runs: 10_000, Name: '  child'},
      {Runs: 3, Name: 'alpha'},
    ]

    const result = formatTable(rows, ['Name', 'Runs'])

    expect(result).toBe(['Name     Runs', '-------  -----', 'zeta     2', '  child  10000', 'alpha    3'].join('\n'))
  })

  test('renders missing cells as blanks while preserving numeric zero', () => {
    const rows: Array<TableRow> = [{Name: 'zero', Runs: 0}, {Runs: 2}, {Name: 'leaf'}]

    const result = formatTable(rows, ['Name', 'Runs'])

    expect(result).toBe(['Name  Runs', '----  ----', 'zero  0', '      2', 'leaf'].join('\n'))
  })

  test('replaces embedded line breaks and tabs with spaces without splitting rows', () => {
    const rows: Array<TableRow> = [
      {Name: 'a\r\nb\tc', Runs: 1},
      {Name: 'plain', Runs: 2},
    ]

    const result = formatTable(rows, ['Name', 'Runs'])

    expect(result).toBe(['Name    Runs', '------  ----', 'a  b c  1', 'plain   2'].join('\n'))
  })

  test('retains headers and separators when there are no rows', () => {
    const result = formatTable([], ['Name', 'Runs'])

    expect(result).toBe('Name  Runs\n----  ----')
  })
})
