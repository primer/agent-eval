import * as z from 'zod/mini'

const TestResultsSchema = z.object({
  numTotalTests: z.number(),
  numPassedTests: z.number(),
  numFailedTests: z.number(),
  numPendingTests: z.number(),
  numTodoTests: z.number(),
  success: z.boolean(),
})

function parseTestResults(data: unknown) {
  return TestResultsSchema.safeParse(data)
}

export {TestResultsSchema, parseTestResults}
