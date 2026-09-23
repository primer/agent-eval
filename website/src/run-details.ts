import fs from 'node:fs/promises'
import path from 'node:path'
import type {CheckOutput, CopilotRunner, ExperimentOutput, ExperimentTrialOutput, JudgeOutput} from '@primer/agent-eval'
import type {BenchmarkRun} from './benchmark-results'
import {formatChecks, summarizeTrials} from './check-results'
import {getWorkspaceFiles, type WorkspaceFiles} from './workspace-files'
import {getArtifactCandidates, isWithinDirectory, LEGACY_ARTIFACTS_DIRECTORY} from './artifacts'

const REPOSITORY_ROOT = path.resolve(process.cwd(), '..')

type LogMessage = ExperimentTrialOutput['agent']['sessions'][number]['messages'][number]
type Walkthrough = ExperimentTrialOutput['walkthrough']
type JudgeDetails = Pick<JudgeOutput, 'judge' | 'result'>

type TranscriptEntry = {
  id: string
  label: string
  timestamp?: string
  content: string
  toolCall?: {
    name: string
    arguments?: string
    status: 'Started' | 'Completed successfully' | 'Failed'
    output?: string
  }
}

type WalkthroughUrls =
  | {
      type: 'Unavailable'
    }
  | {type: 'Screenshot'; screenshot: string}
  | {type: 'Screenshots'; screenshots: Array<string>}
  | {type: 'Video'; video: string}

type RunResult = {
  id: string
  scenarioId: string
  capability?: {id: string; name: string}
  treatment: string
  model: string
  reasoningEffort?: string
  runner: CopilotRunner
  checkSummary: string
  turns: number
  outputTokens: number
  premiumRequests: number
  totalApiDurationMs: number
  sessionDurationMs: number
  tools: Array<{name: string; count: number}>
  counts: {checks: number; transcript: number; judges: number}
  walkthroughPreview: {type: Walkthrough['type']; count: number}
  detailsUrl: string
  transcriptUrl: string
  workspace: WorkspaceFiles
}

type TrialDetails = {
  id: string
  checks: Array<CheckOutput>
  walkthrough: WalkthroughUrls
  judges: Array<JudgeDetails>
}

type RunCollection = 'benchmarks' | 'experiments'

type MediaAsset = {
  name: string
  filepath: string
  mimeType: string
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
  const toolCalls = new Map<string, NonNullable<TranscriptEntry['toolCall']>>()

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
        const args = data?.arguments
        const toolCall: NonNullable<TranscriptEntry['toolCall']> = {
          name: toolName,
          arguments: typeof args === 'string' ? args : JSON.stringify(args, null, 2),
          status: 'Started',
        }
        if (toolCallId) {
          toolCalls.set(toolCallId, toolCall)
        }
        entries.push({
          id,
          label: `Tool call: ${toolName}`,
          timestamp,
          content: toolCall.arguments ?? 'No arguments recorded.',
          toolCall,
        })
        break
      }
      case 'tool.execution_complete': {
        const toolCallId = getString(data, 'toolCallId')
        const toolCall = toolCallId ? toolCalls.get(toolCallId) : undefined
        const status = data?.success === true ? 'Completed successfully' : 'Failed'
        const result = asRecord(data?.result)
        const error = asRecord(data?.error)
        const output =
          data?.success === true
            ? getString(result, 'detailedContent') || getString(result, 'content')
            : [getString(error, 'code'), getString(error, 'message')].filter(Boolean).join(': ') || undefined
        if (toolCall) {
          toolCall.status = status
          toolCall.output = output
        }
        entries.push({
          id,
          label: `Tool result: ${toolCall?.name ?? 'Unknown tool'}`,
          timestamp,
          content: output ? `${status}\n\n${output}` : status,
          ...(!toolCall ? {toolCall: {name: 'Unknown tool', status, output}} : {}),
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
    return entry.content.length > 0 || entry.toolCall !== undefined
  })
}

async function getArtifactFile(
  artifactPath: string | undefined,
  runDirectory: string,
  walkthroughDirectory?: string,
): Promise<string | undefined> {
  if (!artifactPath) {
    return undefined
  }

  if (walkthroughDirectory && artifactPath.startsWith('walkthrough/')) {
    const relative = path.posix.relative('walkthrough', artifactPath)
    if (relative === '..' || relative.startsWith('../')) {
      throw new Error(`Walkthrough path points outside its directory: ${artifactPath}`)
    }
    artifactPath = path.join(walkthroughDirectory, relative)
  }

  for (const candidate of getArtifactCandidates(artifactPath, runDirectory)) {
    try {
      const runArtifactsDirectory = path.join(runDirectory, 'artifacts')
      const artifactsDirectory = isWithinDirectory(runArtifactsDirectory, candidate)
        ? runArtifactsDirectory
        : LEGACY_ARTIFACTS_DIRECTORY
      // Resolve the parent so an artifacts-directory symlink cannot redefine the allowed root.
      const realArtifactsDirectory = path.join(
        await fs.realpath(path.dirname(artifactsDirectory)),
        path.basename(artifactsDirectory),
      )
      const filepath = await fs.realpath(candidate)
      if (!isWithinDirectory(realArtifactsDirectory, filepath)) {
        throw new Error(`Walkthrough artifact points outside its artifacts directory: ${candidate}`)
      }
      const stats = await fs.stat(filepath)
      if (!stats.isFile()) {
        throw new Error(`Walkthrough artifact is not a file: ${candidate}`)
      }
      return filepath
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

async function getWalkthroughAssets(
  walkthrough: Walkthrough,
  runDirectory: string,
  baseUrl: string,
  walkthroughDirectory?: string,
): Promise<{walkthrough: WalkthroughUrls; media: Array<MediaAsset>}> {
  const paths =
    walkthrough.type === 'Screenshots'
      ? walkthrough.screenshots
      : walkthrough.type === 'Screenshot' || walkthrough.type === 'Video'
        ? [walkthrough.filepath]
        : []
  const media: Array<MediaAsset> = []
  for (const [index, artifactPath] of paths.entries()) {
    const filepath = await getArtifactFile(artifactPath, runDirectory, walkthroughDirectory)
    if (filepath) {
      const mimeType = walkthrough.type === 'Video' ? 'video/webm' : getImageMimeType(artifactPath)
      const extension = mimeType === 'video/webm' ? 'webm' : mimeType === 'image/jpeg' ? 'jpg' : 'png'
      media.push({name: `media-${index}.${extension}`, filepath, mimeType})
    }
  }
  const urls = media.map(asset => {
    return `${baseUrl}/${asset.name}`
  })
  let urlsByType: WalkthroughUrls = {type: 'Unavailable'}
  if (urls.length > 0) {
    if (walkthrough.type === 'Screenshots') {
      urlsByType = {type: 'Screenshots', screenshots: urls}
    } else if (walkthrough.type === 'Screenshot') {
      urlsByType = {type: 'Screenshot', screenshot: urls[0]}
    } else if (walkthrough.type === 'Video') {
      urlsByType = {type: 'Video', video: urls[0]}
    }
  }
  return {walkthrough: urlsByType, media}
}

function getTrialDataUrl(collection: RunCollection, id: string, date: string, trialId: string): string {
  const segments = [collection, id, date, trialId].map(segment => {
    return encodeURIComponent(segment)
  })
  return `${process.env.PAGES_BASE_PATH ?? ''}/run-data/${segments.join('/')}`
}

function createTrialTranscript(result: ExperimentTrialOutput): Array<TranscriptEntry> {
  return result.agent.sessions.flatMap((session, sessionIndex) => {
    return createTranscript(session.messages).map(entry => {
      return {...entry, id: `${sessionIndex}:${entry.id}`}
    })
  })
}

async function createTrialDetails(
  result: ExperimentTrialOutput,
  runDirectory: string,
  baseUrl: string,
): Promise<TrialDetails> {
  const {walkthrough} = await getWalkthroughAssets(
    result.walkthrough,
    runDirectory,
    baseUrl,
    result.artifacts.walkthroughDirectory,
  )
  return {
    id: result.id,
    checks: result.checks.map(check => {
      return {
        ...check,
        check: {...check.check, files: createReferenceFiles(check.check.files)},
      }
    }),
    walkthrough,
    judges: createJudgeDetails(result.judges),
  }
}

async function createExperimentRunDetails(
  date: string,
  output: ExperimentOutput,
  collection: RunCollection = 'experiments',
  runDirectory: string = path.join(REPOSITORY_ROOT, 'results', collection, output.id, date),
): Promise<RunDetails> {
  const treatments = new Map(
    [...output.treatments].map(([id, treatment]) => {
      return [id, treatment.name]
    }),
  )

  const results: Array<RunResult> = []
  for (const result of output.trials.values()) {
    const summary = summarizeTrials([result])
    const treatment = treatments.get(result.treatmentId)
    if (treatment === undefined) {
      throw new Error(`Unknown treatment "${result.treatmentId}" for trial "${result.id}"`)
    }
    const baseUrl = getTrialDataUrl(collection, output.id, date, result.id)
    const tools = new Map<string, number>()
    for (const session of result.agent.sessions) {
      for (const [name, count] of Object.entries(session.tools)) {
        tools.set(name, (tools.get(name) ?? 0) + count)
      }
    }
    results.push({
      id: result.id,
      scenarioId: result.scenarioId,
      treatment,
      model: result.model.name,
      reasoningEffort: result.model.reasoningEffort,
      runner: result.runner ?? 'copilot-cli',
      checkSummary: formatChecks(summary),
      turns: result.agent.sessions.reduce((total, session) => {
        return total + session.turns
      }, 0),
      outputTokens: summary.outputTokens,
      premiumRequests: summary.premiumRequests,
      totalApiDurationMs: summary.totalApiDurationMs,
      sessionDurationMs: summary.sessionDurationMs,
      tools: Array.from(tools, ([name, count]) => {
        return {name, count}
      }).toSorted((first, second) => {
        return second.count - first.count || first.name.localeCompare(second.name)
      }),
      counts: {
        checks: result.checks.length,
        transcript: createTrialTranscript(result).length,
        judges: result.judges.length,
      },
      walkthroughPreview: {
        type: result.walkthrough.type,
        count:
          result.walkthrough.type === 'Screenshots'
            ? result.walkthrough.screenshots.length
            : result.walkthrough.type === 'Unavailable'
              ? 0
              : 1,
      },
      detailsUrl: `${baseUrl}/details.json`,
      transcriptUrl: `${baseUrl}/transcript.json`,
      workspace: await getWorkspaceFiles(result.artifacts.workspaceDirectory, runDirectory),
    })
  }
  return {date, results}
}

function createJudgeDetails(judges: Array<JudgeOutput>): Array<JudgeDetails> {
  return judges.map(judge => {
    return {
      judge: {...judge.judge, files: createReferenceFiles(judge.judge.files)},
      result: judge.result,
    }
  })
}

function createReferenceFiles(files: CheckOutput['check']['files']): CheckOutput['check']['files'] {
  return files.map(({relativePath}) => {
    return {filepath: relativePath, relativePath}
  })
}

async function createBenchmarkRunDetails(run: BenchmarkRun): Promise<RunDetails> {
  const output = run.output
  const details = await createExperimentRunDetails(run.name, output, 'benchmarks', run.directory)
  return {
    ...details,
    results: details.results.map(result => {
      const trial = output.trials.get(result.id)
      const capability = trial ? output.capabilities.get(trial.capabilityId) : undefined
      if (!capability) {
        throw new Error(`Unknown capability for benchmark trial "${result.id}"`)
      }
      return {...result, capability: {id: capability.id, name: capability.name}}
    }),
  }
}

export {
  createBenchmarkRunDetails,
  createExperimentRunDetails,
  createTranscript,
  createTrialDetails,
  createTrialTranscript,
  getTrialDataUrl,
  getWalkthroughAssets,
}
export type {JudgeDetails, RunCollection, RunDetails, TranscriptEntry, TrialDetails, WalkthroughUrls}
