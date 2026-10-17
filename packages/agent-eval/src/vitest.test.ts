import {describe, expect, test} from 'vitest'
import {extractTestDescription, getTestMetadata, parseTestResults} from './vitest'

const testResults = {
  numTotalTests: 4,
  numPassedTests: 1,
  numFailedTests: 1,
  numPendingTests: 1,
  numTodoTests: 1,
  success: false,
  testResults: [
    {
      assertionResults: [
        {fullName: 'math adds numbers', title: 'adds numbers', status: 'passed', location: {line: 2}, meta: {}},
        {
          fullName: 'math subtracts numbers',
          title: 'subtracts numbers',
          status: 'failed',
          location: {line: 5},
          meta: {},
        },
        {
          fullName: 'math multiplies numbers',
          title: 'multiplies numbers',
          status: 'skipped',
          location: {line: 7},
          meta: {description: 'Description from Vitest metadata.'},
        },
        {fullName: 'math divides numbers', title: 'divides numbers', status: 'todo', location: {line: 8}, meta: {}},
      ],
    },
  ],
}

describe(parseTestResults, () => {
  test('parses individual assertion results', () => {
    expect(parseTestResults(testResults)).toMatchObject({
      success: true,
      data: {
        testResults: [
          {
            assertionResults: [
              {title: 'adds numbers', status: 'passed'},
              {title: 'subtracts numbers', status: 'failed'},
              {title: 'multiplies numbers', status: 'skipped'},
              {title: 'divides numbers', status: 'todo'},
            ],
          },
        ],
      },
    })
  })
})

describe(extractTestDescription, () => {
  test('extracts JSDoc, block, and consecutive line comments', () => {
    const source = `  /** Adds two values together. */
  test('adds numbers', () => {})
  /* Subtracts the second value
   * from the first value.
   */
  it('subtracts numbers', () => {})
  // Multiplies the values.
  // Keeps the sign.
  test.skip('multiplies numbers', () => {})`

    expect(extractTestDescription(source, 2)).toBe('Adds two values together.')
    expect(extractTestDescription(source, 6)).toBe('Subtracts the second value\nfrom the first value.')
    expect(extractTestDescription(source, 9)).toBe('Multiplies the values.\nKeeps the sign.')
  })

  test('ignores comments that are not adjacent to a test', () => {
    const source = `/** Describes a helper, not the test. */
const value = 2

test('uses the value', () => value)`

    expect(extractTestDescription(source, 4)).toBeUndefined()
  })
})

describe(getTestMetadata, () => {
  test('includes test titles, statuses, full names, and descriptions', () => {
    const parsed = parseTestResults(testResults)
    expect(parsed.success).toBe(true)
    if (!parsed.success) {
      return
    }

    const source = `/** Adds two values together. */
test('adds numbers', () => {})

// Subtracts the second value.
test('subtracts numbers', () => {})

test.skip('multiplies numbers', () => {})
test.todo('divides numbers')`

    expect(getTestMetadata(parsed.data, source)).toEqual([
      {
        title: 'adds numbers',
        fullName: 'math adds numbers',
        status: 'passed',
        description: 'Adds two values together.',
      },
      {
        title: 'subtracts numbers',
        fullName: 'math subtracts numbers',
        status: 'failed',
        description: 'Subtracts the second value.',
      },
      {
        title: 'multiplies numbers',
        fullName: 'math multiplies numbers',
        status: 'skipped',
        description: 'Description from Vitest metadata.',
      },
      {
        title: 'divides numbers',
        fullName: 'math divides numbers',
        status: 'todo',
      },
    ])
  })
})
