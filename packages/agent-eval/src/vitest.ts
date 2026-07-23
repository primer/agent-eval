import * as z from 'zod/mini'

const TestStatusSchema = z.enum(['passed', 'failed', 'skipped', 'pending', 'todo', 'disabled'])

const AssertionResultSchema = z.object({
  fullName: z.string(),
  status: TestStatusSchema,
  title: z.string(),
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
  if (comment.startsWith('//')) {
    return comment
      .split(/\r?\n/)
      .map(line => line.replace(/^\s*\/\/\s?/, '').trimEnd())
      .join('\n')
      .trim()
  }

  return comment
    .replace(/^\/\*\*?/, '')
    .replace(/\*\/$/, '')
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*\*?\s?/, '').trimEnd())
    .join('\n')
    .trim()
}

function readComment(source: string, start: number): {comment: string; end: number} | undefined {
  if (source.startsWith('//', start)) {
    let end = source.indexOf('\n', start)
    if (end === -1) {
      end = source.length
    }
    return {
      comment: source.slice(start, end),
      end,
    }
  }

  if (source.startsWith('/*', start)) {
    const closingIndex = source.indexOf('*/', start + 2)
    if (closingIndex === -1) {
      return undefined
    }
    const end = closingIndex + 2
    return {
      comment: source.slice(start, end),
      end,
    }
  }

  return undefined
}

function readStringLiteral(source: string, start: number): {value: string; end: number} | undefined {
  const quote = source[start]
  if (quote !== "'" && quote !== '"' && quote !== '`') {
    return undefined
  }

  let value = ''
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index]
    if (character === quote) {
      return {value, end: index + 1}
    }
    if (quote === '`' && character === '$' && source[index + 1] === '{') {
      return undefined
    }
    if (character !== '\\') {
      value += character
      continue
    }

    index += 1
    const escapedCharacter = source[index]
    if (escapedCharacter === undefined) {
      return undefined
    }
    const escapes: Record<string, string> = {
      '0': '\0',
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
      v: '\v',
    }
    value += escapes[escapedCharacter] ?? escapedCharacter
  }

  return undefined
}

function readIdentifier(source: string, start: number): {value: string; end: number} | undefined {
  const match = /^[A-Za-z_$][\w$]*/.exec(source.slice(start))
  if (!match) {
    return undefined
  }
  return {
    value: match[0],
    end: start + match[0].length,
  }
}

function skipWhitespace(source: string, start: number): number {
  let index = start
  while (index < source.length && /\s/.test(source[index])) {
    index += 1
  }
  return index
}

function readTestTitle(source: string, start: number): {title: string; end: number} | undefined {
  const identifier = readIdentifier(source, start)
  if (!identifier || (identifier.value !== 'test' && identifier.value !== 'it')) {
    return undefined
  }

  let index = skipWhitespace(source, identifier.end)
  while (source[index] === '.') {
    index = skipWhitespace(source, index + 1)
    const modifier = readIdentifier(source, index)
    if (!modifier || modifier.value === 'each') {
      return undefined
    }
    index = skipWhitespace(source, modifier.end)
  }

  if (source[index] !== '(') {
    return undefined
  }
  index = skipWhitespace(source, index + 1)

  const title = readStringLiteral(source, index)
  if (!title) {
    return undefined
  }
  return {
    title: title.value,
    end: title.end,
  }
}

function extractTestDescriptions(source: string): Map<string, Array<string>> {
  const descriptions = new Map<string, Array<string>>()
  let pendingComments: Array<string> = []
  let index = 0

  while (index < source.length) {
    if (/\s/.test(source[index])) {
      index += 1
      continue
    }

    const comment = readComment(source, index)
    if (comment) {
      pendingComments.push(comment.comment)
      index = comment.end
      continue
    }

    const testTitle = readTestTitle(source, index)
    if (testTitle) {
      const description = pendingComments.map(normalizeComment).filter(Boolean).join('\n')
      if (description) {
        const titleDescriptions = descriptions.get(testTitle.title) ?? []
        titleDescriptions.push(description)
        descriptions.set(testTitle.title, titleDescriptions)
      }
      pendingComments = []
      index = testTitle.end
      continue
    }

    pendingComments = []
    const stringLiteral = readStringLiteral(source, index)
    index = stringLiteral?.end ?? index + 1
  }

  return descriptions
}

type ParsedTestResults = z.infer<typeof TestResultsSchema>

function getTestMetadata(testResults: ParsedTestResults, testSource: string) {
  const descriptions = extractTestDescriptions(testSource)

  return testResults.testResults.flatMap(testResult =>
    testResult.assertionResults.map(assertion => {
      const titleDescriptions = descriptions.get(assertion.title)
      const description = assertion.meta.description ?? titleDescriptions?.shift()

      return {
        title: assertion.title,
        fullName: assertion.fullName,
        status: assertion.status,
        ...(description ? {description} : {}),
      }
    }),
  )
}

export {TestResultsSchema, extractTestDescriptions, getTestMetadata, parseTestResults}
