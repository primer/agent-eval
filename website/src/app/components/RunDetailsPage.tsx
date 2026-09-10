import 'server-only'
import {getFilePreviewKey} from '../../file-preview-key'
import type {FilePreviewReference} from '../../file-preview'
import type {RunDetails} from '../../run-details'
import type {WorkspaceEntry} from '../../workspace-files'
import {RunDetailsView, type RunDetailsViewProps} from './RunDetailsView'

function renderEntry(entry: WorkspaceEntry, previewBase: string): WorkspaceEntry<FilePreviewReference> {
  if (entry.type === 'directory') {
    return {
      ...entry,
      children: entry.children.map(child => {
        return renderEntry(child, previewBase)
      }),
    }
  }
  return {
    ...entry,
    preview:
      entry.preview.type === 'text' && entry.preview.content.length > 0
        ? {type: 'remote', url: `${previewBase}/${getFilePreviewKey(entry.path)}/preview.json`}
        : entry.preview,
  }
}

type Props = Omit<RunDetailsViewProps, 'run'> & {run: RunDetails}

export function RunDetailsPage({resource, run}: Props) {
  const results = run.results.map(result => {
    const workspace = result.workspace
    const segments = [resource.id, run.date, result.id].map(segment => {
      return encodeURIComponent(segment)
    })
    const previewBase = `${process.env.PAGES_BASE_PATH ?? ''}/file-previews${resource.collectionHref}/${segments.join('/')}`
    return {
      ...result,
      workspace:
        workspace.type === 'available'
          ? {
              ...workspace,
              entries: workspace.entries.map(entry => {
                return renderEntry(entry, previewBase)
              }),
            }
          : workspace,
    }
  })

  return <RunDetailsView resource={resource} run={{...run, results}} />
}
