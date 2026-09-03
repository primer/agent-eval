import {get as getExperiment} from '../../../../../experiments'
import {get as getRun, list as listRuns} from '../../../../../runs'
import type {RunOutput} from '../../../../../runs'
import {notFound} from 'next/navigation'
import fs from 'node:fs/promises'
import path from 'node:path'
import {Page} from './components/Page'
import type {RunDetails, TranscriptEntry} from './components/Page'

const EMPTY_RUN_PARAM = '__no-runs__'
const REPOSITORY_ROOT = path.resolve(process.cwd(), '..')
const ARTIFACTS_DIRECTORY = path.join(REPOSITORY_ROOT, 'artifacts')

type RunPageProps = {
  params: Promise<{
    id: string
    date: string
  }>
}

type LogMessage = RunOutput['results'][number]['assistant']['logs'][number]
type Walkthrough = RunOutput['results'][number]['walkthrough']

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

  return entries.filter(entry => entry.content.length > 0)
}

async function getArtifactDataUrl(artifactPath: string | undefined, mimeType: string): Promise<string | undefined> {
  if (!artifactPath) {
    return undefined
  }

  const absolutePath = path.isAbsolute(artifactPath) ? artifactPath : path.resolve(REPOSITORY_ROOT, artifactPath)
  const relativePath = path.relative(ARTIFACTS_DIRECTORY, absolutePath)
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return undefined
  }

  try {
    const contents = await fs.readFile(absolutePath)
    return `data:${mimeType};base64,${contents.toString('base64')}`
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

function getImageMimeType(artifactPath: string): string {
  const extension = path.extname(artifactPath).toLowerCase()
  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg'
  }
  return 'image/png'
}

export type WalkthroughDataUrl =
  | {
      type: 'Unavailable'
    }
  | {type: 'Screenshot'; screenshot: string}
  | {type: 'Screenshots'; screenshots: Array<string>}
  | {type: 'Video'; video: string}

async function getWalkthroughDataUrls(walkthrough: Walkthrough): Promise<WalkthroughDataUrl> {
  if (walkthrough.type === 'Screenshot') {
    return {
      type: 'Screenshot',
      screenshot: await getArtifactDataUrl(walkthrough.filepath, getImageMimeType(walkthrough.filepath)),
    }
  }

  if (walkthrough.type === 'Screenshots') {
    const sources = await Promise.all(
      walkthrough.screenshots.map(artifactPath => getArtifactDataUrl(artifactPath, getImageMimeType(artifactPath))),
    )
    return {
      type: 'Screenshots',
      screenshots: sources.filter((source): source is string => source !== undefined),
    }
  }

  if (walkthrough.type === 'Video') {
    return {
      type: 'Video',
      video: await getArtifactDataUrl(walkthrough.filepath, 'video/webm'),
    }
  }

  return {
    type: 'Unavailable',
  }
}

async function createRunDetails(date: string, output: RunOutput): Promise<RunDetails> {
  const treatments = new Map(output.treatments.map(treatment => [treatment.id, treatment.config.name]))
  return {
    date,
    results: await Promise.all(
      output.results.map(async result => ({
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
        walkthrough: await getWalkthroughDataUrls(result.walkthrough),
        transcript: createTranscript(result.assistant.logs),
      })),
    ),
  }
}

export const dynamicParams = false

export default async function RunPage(props: RunPageProps) {
  const {id, date} = await props.params
  if (id === EMPTY_RUN_PARAM && date === EMPTY_RUN_PARAM) {
    notFound()
  }

  const [experiment, run] = await Promise.all([getExperiment(id), getRun(date)])
  if (run.output.experiment.id !== id) {
    notFound()
  }

  return <Page experiment={experiment} run={await createRunDetails(date, run.output)} />
}

export async function generateStaticParams() {
  const runs = await listRuns()
  if (runs.length === 0) {
    return [{id: EMPTY_RUN_PARAM, date: EMPTY_RUN_PARAM}]
  }

  return runs.map(run => ({
    id: run.output.experiment.id,
    date: run.name,
  }))
}
