import fs from 'node:fs/promises'
import path from 'node:path'
import type {RunOutput, RunOutputResult} from './runs'

const REPOSITORY_ROOT = path.resolve(process.cwd(), '..')
const LEGACY_ARTIFACTS_DIRECTORY = path.join(REPOSITORY_ROOT, 'artifacts')

type LogMessage = RunOutputResult['assistant']['logs'][number]
type Walkthrough = RunOutputResult['walkthrough']

type TranscriptEntry = {
  id: string
  label: string
  timestamp?: string
  content: string
}

type WalkthroughDataUrl =
  | {
      type: 'Unavailable'
    }
  | {type: 'Screenshot'; screenshot: string}
  | {type: 'Screenshots'; screenshots: Array<string>}
  | {type: 'Video'; video: string}

type RunResult = {
  id: string
  scenarioId: string
  context?: string
  treatment: string
  model: string
  reasoningEffort?: string
  testsPassed: number
  totalTests: number
  turns: number
  outputTokens: number
  premiumRequests: number
  totalApiDurationMs: number
  sessionDurationMs: number
  tests: Array<{
    fullName: string
    status: string
    description?: string
  }>
  transcript: Array<TranscriptEntry>
  walkthrough: WalkthroughDataUrl
}

type RunDetails = {
  date: string
  results: Array<RunResult>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function getString(record: Record<string, unknown> | null, key: string): string | undefined {
  const value = record?.[key]
  return typeof value === 'string' ? value : undefined
}

function createTranscript(logs: Array<LogMessage>): Array<TranscriptEntry> {
  const entries: Array<TranscriptEntry> = []
  const messageEntries = new Map<string, TranscriptEntry>()
  const reasoningEntries = new Map<string, TranscriptEntry>()
  const toolNames = new Map<string, string>()

  for (const [index, message] of logs.entries()) {
    const record = asRecord(message)
    const data = asRecord(record?.data)
    const timestamp = getString(record, 'timestamp')
    const id = getString(record, 'id') ?? `${message.type}-${index}`

    switch (message.type) {
      case 'user.message': {
        const content = getString(data, 'content')
        if (content) {
          entries.push({id, label: 'User', timestamp, content})
        }
        break
      }
      case 'assistant.message_delta': {
        const messageId = getString(data, 'messageId')
        const delta = getString(data, 'deltaContent')
        if (!messageId || !delta) {
          break
        }

        let entry = messageEntries.get(messageId)
        if (!entry) {
          entry = {id, label: 'Assistant', timestamp, content: ''}
          messageEntries.set(messageId, entry)
          entries.push(entry)
        }
        entry.content += delta
        break
      }
      case 'assistant.message': {
        const messageId = getString(data, 'messageId')
        const content = getString(data, 'content')
        const entry = messageId ? messageEntries.get(messageId) : undefined
        if (entry) {
          if (content) {
            entry.content = content
          }
        } else if (content) {
          entries.push({id, label: 'Assistant', timestamp, content})
        }
        break
      }
      case 'assistant.reasoning_delta': {
        const reasoningId = getString(data, 'reasoningId')
        const delta = getString(data, 'deltaContent')
        if (!reasoningId || !delta) {
          break
        }

        let entry = reasoningEntries.get(reasoningId)
        if (!entry) {
          entry = {id, label: 'Reasoning', timestamp, content: ''}
          reasoningEntries.set(reasoningId, entry)
          entries.push(entry)
        }
        entry.content += delta
        break
      }
      case 'assistant.reasoning': {
        const reasoningId = getString(data, 'reasoningId')
        const content = getString(data, 'content')
        const entry = reasoningId ? reasoningEntries.get(reasoningId) : undefined
        if (entry) {
          if (content) {
            entry.content = content
          }
        } else if (content) {
          entries.push({id, label: 'Reasoning', timestamp, content})
        }
        break
      }
      case 'tool.execution_start': {
        const toolName = getString(data, 'toolName') ?? 'Unknown tool'
        const toolCallId = getString(data, 'toolCallId')
        if (toolCallId) {
          toolNames.set(toolCallId, toolName)
        }
        entries.push({id, label: `Tool call: ${toolName}`, timestamp, content: 'Started'})
        break
      }
      case 'tool.execution_complete': {
        const toolCallId = getString(data, 'toolCallId')
        const toolName = toolCallId ? toolNames.get(toolCallId) : undefined
        entries.push({
          id,
          label: `Tool result: ${toolName ?? 'Unknown tool'}`,
          timestamp,
          content: data?.success === true ? 'Completed successfully' : 'Failed',
        })
        break
      }
      case 'session.info': {
        const content = getString(data, 'message')
        if (content) {
          entries.push({id, label: 'Session', timestamp, content})
        }
        break
      }
      case 'session.task_complete': {
        const content = getString(data, 'summary')
        if (content) {
          entries.push({id, label: 'Summary', timestamp, content})
        }
        break
      }
    }
  }

  return entries.filter(entry => {
    return entry.content.length > 0
  })
}

function isWithinDirectory(directory: string, filepath: string): boolean {
  const relativePath = path.relative(directory, filepath)
  return relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath)
}

function getArtifactCandidates(artifactPath: string, runDirectory: string): Array<string> {
  const runArtifactsDirectory = path.join(runDirectory, 'artifacts')

  if (!path.isAbsolute(artifactPath)) {
    const candidate = path.resolve(runDirectory, artifactPath)
    return isWithinDirectory(runArtifactsDirectory, candidate) ? [candidate] : []
  }

  if (isWithinDirectory(LEGACY_ARTIFACTS_DIRECTORY, artifactPath)) {
    return [artifactPath]
  }

  const segments = artifactPath.split(/[\\/]+/)
  const artifactsIndex = segments.lastIndexOf('artifacts')
  if (artifactsIndex === -1) {
    return []
  }

  const artifactSegments = segments.slice(artifactsIndex + 1)
  return [
    path.join(runArtifactsDirectory, ...artifactSegments),
    path.join(LEGACY_ARTIFACTS_DIRECTORY, ...artifactSegments),
  ].filter(candidate => {
    return (
      isWithinDirectory(runArtifactsDirectory, candidate) || isWithinDirectory(LEGACY_ARTIFACTS_DIRECTORY, candidate)
    )
  })
}

async function getArtifactDataUrl(
  artifactPath: string | undefined,
  mimeType: string,
  runDirectory: string,
): Promise<string | undefined> {
  if (!artifactPath) {
    return undefined
  }

  for (const candidate of getArtifactCandidates(artifactPath, runDirectory)) {
    try {
      const contents = await fs.readFile(candidate)
      return `data:${mimeType};base64,${contents.toString('base64')}`
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }

  return undefined
}

function getImageMimeType(artifactPath: string): string {
  const extension = path.extname(artifactPath).toLowerCase()
  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg'
  }
  return 'image/png'
}

async function getWalkthroughDataUrls(walkthrough: Walkthrough, runDirectory: string): Promise<WalkthroughDataUrl> {
  if (walkthrough.type === 'Screenshot') {
    const screenshot = await getArtifactDataUrl(
      walkthrough.filepath,
      getImageMimeType(walkthrough.filepath),
      runDirectory,
    )
    return screenshot
      ? {
          type: 'Screenshot',
          screenshot,
        }
      : {type: 'Unavailable'}
  }

  if (walkthrough.type === 'Screenshots') {
    const sources = await Promise.all(
      walkthrough.screenshots.map(artifactPath => {
        return getArtifactDataUrl(artifactPath, getImageMimeType(artifactPath), runDirectory)
      }),
    )
    const screenshots = sources.filter((source): source is string => {
      return source !== undefined
    })
    return screenshots.length > 0
      ? {
          type: 'Screenshots',
          screenshots,
        }
      : {type: 'Unavailable'}
  }

  if (walkthrough.type === 'Video') {
    const video = await getArtifactDataUrl(walkthrough.filepath, 'video/webm', runDirectory)
    return video
      ? {
          type: 'Video',
          video,
        }
      : {type: 'Unavailable'}
  }

  return {
    type: 'Unavailable',
  }
}

async function createExperimentRunDetails(date: string, output: RunOutput, runDirectory: string): Promise<RunDetails> {
  const treatments = new Map(
    output.treatments.map(treatment => {
      return [treatment.id, treatment.config.name]
    }),
  )

  return {
    date,
    results: await Promise.all(
      output.results.map(async result => {
        return {
          id: result.id,
          scenarioId: result.scenarioId,
          treatment: treatments.get(result.treatmentId) ?? 'Unknown treatment',
          model: result.model,
          reasoningEffort: result.reasoningEffort,
          testsPassed: result.testResults.numPassedTests,
          totalTests: result.testResults.numTotalTests,
          turns: result.assistant.turns,
          outputTokens: result.assistant.outputTokens,
          premiumRequests: result.assistant.premiumRequests,
          totalApiDurationMs: result.assistant.totalApiDurationMs,
          sessionDurationMs: result.assistant.sessionDurationMs,
          tests: result.testResults.tests.map(test => {
            return {
              fullName: test.fullName,
              status: test.status,
              description: test.description,
            }
          }),
          walkthrough: await getWalkthroughDataUrls(result.walkthrough, runDirectory),
          transcript: createTranscript(result.assistant.logs),
        }
      }),
    ),
  }
}

export {createExperimentRunDetails, createTranscript, getWalkthroughDataUrls}
export type {RunDetails, TranscriptEntry, WalkthroughDataUrl}
