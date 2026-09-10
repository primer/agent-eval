import 'server-only'
import type {ReactNode} from 'react'
import type {RunDetails} from '../../run-details'
import type {WorkspaceEntry} from '../../workspace-files'
import {FilePreview} from './FilePreview'
import {RunDetailsView, type RunDetailsViewProps} from './RunDetailsView'

function renderEntry(entry: WorkspaceEntry): WorkspaceEntry<ReactNode> {
  if (entry.type === 'directory') {
    return {...entry, children: entry.children.map(renderEntry)}
  }
  return {...entry, preview: <FilePreview file={entry} />}
}

type Props = Omit<RunDetailsViewProps, 'run'> & {run: RunDetails}

export function RunDetailsPage({resource, run}: Props) {
  const results = run.results.map(result => {
    const workspace = result.workspace
    return {
      ...result,
      workspace:
        workspace.type === 'available' ? {...workspace, entries: workspace.entries.map(renderEntry)} : workspace,
    }
  })

  return <RunDetailsView resource={resource} run={{...run, results}} />
}
