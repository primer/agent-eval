import 'server-only'
import {getBenchmarkRun, listBenchmarkRuns} from './benchmark-results'
import {list as listBenchmarks} from './benchmarks'
import {getFilePreviewKey} from './file-preview-key'
import type {FilePreviewData} from './file-preview'
import {get as getExperimentRun, list as listExperimentRuns} from './runs'
import {getWorkspaceFiles, type WorkspaceEntry, type WorkspaceFile} from './workspace-files'

type FilePreviewParams = {
  collection: string
  id: string
  date: string
  trial: string
  file: string
}

const EMPTY_PREVIEW_PARAMS: FilePreviewParams = {
  collection: 'benchmarks',
  id: '__no-runs__',
  date: '__no-runs__',
  trial: '__no-runs__',
  file: '__no-runs__',
}

function isSafeSegment(value: string): boolean {
  return (
    value.length > 0 &&
    value !== '.' &&
    value !== '..' &&
    !/[/\\%]/.test(value) &&
    [...value].every(character => {
      return character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127
    })
  )
}

function isRunDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

function* previewableFiles(entries: Array<WorkspaceEntry>): Generator<WorkspaceFile> {
  for (const entry of entries) {
    if (entry.type === 'directory') {
      yield* previewableFiles(entry.children)
    } else if (entry.preview.type === 'text' && entry.preview.content.length > 0) {
      yield entry
    }
  }
}

async function getTrialWorkspace(params: FilePreviewParams) {
  try {
    if (params.collection === 'benchmarks') {
      const run = await getBenchmarkRun(params.id, params.date)
      if (!run) {
        return null
      }
      const trial = [...run.output.trials.values()].find(candidate => {
        return candidate.id === params.trial
      })
      if (!trial) {
        return null
      }
      return {directory: run.directory, workspaceDirectory: trial.artifacts.workspaceDirectory}
    }

    const run = await getExperimentRun(params.id, params.date)
    const trial = run.output.results.find(candidate => {
      return candidate.id === params.trial
    })
    if (!trial) {
      return null
    }
    return {directory: run.directory, workspaceDirectory: trial.workspaceDirectory}
  } catch (error) {
    // The experiment reader throws for missing runs rather than returning null.
    if (
      error instanceof Error &&
      (('code' in error && error.code === 'ENOENT') ||
        (params.collection === 'experiments' &&
          error.message.startsWith(`Run "${params.date}" for experiment "${params.id}" was not found in: `)))
    ) {
      return null
    }
    throw error
  }
}

async function getFilePreview(params: FilePreviewParams): Promise<FilePreviewData | null> {
  if (
    (params.collection !== 'benchmarks' && params.collection !== 'experiments') ||
    !isSafeSegment(params.id) ||
    !isSafeSegment(params.trial) ||
    !isRunDate(params.date) ||
    !/^[a-f0-9]{64}$/.test(params.file)
  ) {
    return null
  }

  const trial = await getTrialWorkspace(params)
  if (!trial) {
    return null
  }
  const workspace = await getWorkspaceFiles(trial.workspaceDirectory, trial.directory)
  if (workspace.type === 'unavailable') {
    return null
  }
  for (const file of previewableFiles(workspace.entries)) {
    if (getFilePreviewKey(file.path) === params.file) {
      const {highlightFile} = await import('./file-highlighting')
      return highlightFile(file)
    }
  }
  return null
}

async function generateFilePreviewParams(): Promise<Array<FilePreviewParams>> {
  const params: Array<FilePreviewParams> = []

  async function addWorkspace(
    location: Omit<FilePreviewParams, 'file'>,
    workspaceDirectory: string | undefined,
    runDirectory: string,
  ) {
    if (!isSafeSegment(location.id) || !isSafeSegment(location.trial) || !isRunDate(location.date)) {
      throw new Error(`Invalid file preview route parameters: ${JSON.stringify(location)}`)
    }
    const workspace = await getWorkspaceFiles(workspaceDirectory, runDirectory)
    if (workspace.type === 'available') {
      for (const file of previewableFiles(workspace.entries)) {
        params.push({...location, file: getFilePreviewKey(file.path)})
      }
    }
  }

  for (const benchmark of await listBenchmarks()) {
    if (!isSafeSegment(benchmark.id)) {
      throw new Error(`Invalid benchmark file preview ID: ${benchmark.id}`)
    }
    for (const run of await listBenchmarkRuns(benchmark.id)) {
      for (const trial of run.output.trials.values()) {
        await addWorkspace(
          {collection: 'benchmarks', id: benchmark.id, date: run.name, trial: trial.id},
          trial.artifacts.workspaceDirectory,
          run.directory,
        )
      }
    }
  }
  for (const run of await listExperimentRuns()) {
    for (const trial of run.output.results) {
      await addWorkspace(
        {collection: 'experiments', id: run.output.experiment.id, date: run.name, trial: trial.id},
        trial.workspaceDirectory,
        run.directory,
      )
    }
  }

  return params.length > 0 ? params : [{...EMPTY_PREVIEW_PARAMS}]
}

export {generateFilePreviewParams, getFilePreview}
export type {FilePreviewParams}
