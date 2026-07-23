import * as z from 'zod/mini'

const TestStatusSchema = z.enum(['passed', 'failed', 'skipped', 'pending', 'todo', 'disabled'])

const AssertionResultSchema = z.object({
  fullName: z.string(),
  status: TestStatusSchema,
  title: z.string(),
  location: z.optional(
    z.nullable(
      z.object({
        line: z.number(),
      }),
    ),
  ),
  meta: z.object({
    description: z.optional(z.string()),
  }),
})

const TestResultsSchema = z.object({
  numTotalTests: z.number(),
  numPassedTests: z.number(),
  numFailedTests: z.number(),
  numPendingTests: z.number(),
  numTodoTests: z.number(),
  success: z.boolean(),
  testResults: z.array(
    z.object({
      assertionResults: z.array(AssertionResultSchema),
    }),
  ),
})

function parseTestResults(data: unknown) {
  return TestResultsSchema.safeParse(data)
}

function normalizeComment(comment: string): string {
  if (comment.trimStart().startsWith('//')) {
    return comment
      .split(/\r?\n/)
      .map(line => line.replace(/^\s*\/\/\s?/, '').trimEnd())
      .join('\n')
      .trim()
  }

  return comment
    .replace(/^\s*\/\*\*?/, '')
    .replace(/\*\/\s*$/, '')
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*\*?\s?/, '').trimEnd())
    .join('\n')
    .trim()
}

function extractTestDescription(source: string, line: number): string | undefined {
  const lines = source.split(/\r?\n/)
  const previousLineIndex = line - 2
  const previousLine = lines[previousLineIndex]?.trim()
  if (!previousLine) {
    return undefined
  }

  if (previousLine.startsWith('//')) {
    const comments = []
    for (let index = previousLineIndex; index >= 0 && lines[index].trim().startsWith('//'); index -= 1) {
      comments.unshift(lines[index])
    }
    return normalizeComment(comments.join('\n')) || undefined
  }

  if (!previousLine.endsWith('*/')) {
    return undefined
  }

  const comments = []
  for (let index = previousLineIndex; index >= 0; index -= 1) {
    comments.unshift(lines[index])
    if (lines[index].includes('/*')) {
      return normalizeComment(comments.join('\n')) || undefined
    }
  }

  return undefined
}

type ParsedTestResults = z.infer<typeof TestResultsSchema>

function getTestMetadata(testResults: ParsedTestResults, testSource: string) {
  return testResults.testResults.flatMap(testResult =>
    testResult.assertionResults.map(assertion => {
      const description =
        assertion.meta.description ??
        (assertion.location ? extractTestDescription(testSource, assertion.location.line) : undefined)

      return {
        title: assertion.title,
        fullName: assertion.fullName,
        status: assertion.status,
        ...(description ? {description} : {}),
      }
    }),
  )
}

export {TestResultsSchema, extractTestDescription, getTestMetadata, parseTestResults}
