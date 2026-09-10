'use client'

import {FileIcon} from '@primer/octicons-react'
import {TreeView} from '@primer/react'
import {useId, useState} from 'react'
import type {WorkspaceEntry, WorkspaceFile, WorkspaceFiles} from '../../workspace-files'
import styles from './FileExplorer.module.css'

function FileExplorer({workspace}: {workspace: WorkspaceFiles}) {
  const [selectedFile, setSelectedFile] = useState<WorkspaceFile | null>(null)
  const id = useId()

  if (workspace.type === 'unavailable') {
    return <p className="m-0 text-muted">{workspace.reason}</p>
  }

  function renderEntry(entry: WorkspaceEntry) {
    if (entry.type === 'directory') {
      return (
        <TreeView.Item id={`${id}-${entry.path}`} key={entry.path}>
          <TreeView.LeadingVisual>
            <TreeView.DirectoryIcon />
          </TreeView.LeadingVisual>
          {entry.name}
          <TreeView.SubTree>{entry.children.map(renderEntry)}</TreeView.SubTree>
        </TreeView.Item>
      )
    }

    return (
      <TreeView.Item
        current={selectedFile?.path === entry.path}
        id={`${id}-${entry.path}`}
        key={entry.path}
        onSelect={() => {
          setSelectedFile(entry)
        }}
      >
        <TreeView.LeadingVisual>
          <FileIcon />
        </TreeView.LeadingVisual>
        {entry.name}
      </TreeView.Item>
    )
  }

  if (workspace.entries.length === 0) {
    return <p className="m-0 text-muted">No files are available in the generated workspace.</p>
  }

  return (
    <div>
      {workspace.truncated ? (
        <p className="mt-0 text-muted">The file tree is limited to 2,000 entries and 50 directory levels.</p>
      ) : null}
      <div className={styles.explorer}>
        <div className={styles.tree}>
          <TreeView aria-label="Generated workspace files">{workspace.entries.map(renderEntry)}</TreeView>
        </div>
        <section aria-label="File preview" className={styles.preview}>
          {selectedFile ? (
            <>
              <header className={styles.header}>
                <h3 className="text-body-medium m-0 break-all">{selectedFile.path}</h3>
                <span className="text-caption text-muted whitespace-nowrap">
                  {selectedFile.size.toLocaleString('en-US')} bytes
                </span>
              </header>
              {selectedFile.preview.type === 'text' ? (
                selectedFile.preview.content.length > 0 ? (
                  <pre aria-label={selectedFile.path} className={styles.code} tabIndex={0}>
                    <code>{selectedFile.preview.content}</code>
                  </pre>
                ) : (
                  <p className="p-3 m-0 text-muted">This file is empty.</p>
                )
              ) : (
                <p className="p-3 m-0 text-muted">{selectedFile.preview.reason}</p>
              )}
            </>
          ) : (
            <p className="p-3 m-0 text-muted">Select a file to view its contents.</p>
          )}
        </section>
      </div>
    </div>
  )
}

export {FileExplorer}
