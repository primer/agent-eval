import {describe, expect, test} from 'vitest'
import {extractTestDescriptions, getTestMetadata, parseTestResults} from './vitest'

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
        {fullName: 'math adds numbers', title: 'adds numbers', status: 'passed', meta: {}},
        {fullName: 'math subtracts numbers', title: 'subtracts numbers', status: 'failed', meta: {}},
        {
          fullName: 'math multiplies numbers',
          title: 'multiplies numbers',
          status: 'skipped',
          meta: {description: 'Description from Vitest metadata.'},
        },
        {fullName: 'math divides numbers', title: 'divides numbers', status: 'todo', meta: {}},
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

describe(extractTestDescriptions, () => {
  test('extracts JSDoc, block, and consecutive line comments', () => {
    const source = `
      /** Adds two values together. */
      test('adds numbers', () => {})

      /* Subtracts the second value
       * from the first value.
       */
      it('subtracts numbers', () => {})

      // Multiplies the values.
      // Keeps the sign.
      test.skip('multiplies numbers', () => {})
    `

    expect(Object.fromEntries(extractTestDescriptions(source))).toEqual({
      'adds numbers': ['Adds two values together.'],
      'subtracts numbers': ['Subtracts the second value\nfrom the first value.'],
      'multiplies numbers': ['Multiplies the values.\nKeeps the sign.'],
    })
  })

  test('ignores comments that are not adjacent to a test', () => {
    const source = `
      /** Describes a helper, not the test. */
      const value = 2

      test('uses the value', () => value)
    `

    expect(extractTestDescriptions(source)).toEqual(new Map())
  })
})

describe(getTestMetadata, () => {
  test('includes test titles, statuses, full names, and descriptions', () => {
    const parsed = parseTestResults(testResults)
    expect(parsed.success).toBe(true)
    if (!parsed.success) {
      return
    }

    const source = `
      /** Adds two values together. */
      test('adds numbers', () => {})

      // Subtracts the second value.
      test('subtracts numbers', () => {})
    `

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
